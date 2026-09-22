// Package assets validates immutable image bytes before external storage, then
// reauthorizes and persists metadata/Audit in a short service-owned transaction.
package assets

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
	"github.com/deepfurry/gopher-atlas/internal/policy"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	_ "golang.org/x/image/webp"
)

const MaxFileBytes = 10 << 20
const OuterBodyLimit = 12 << 20
const PublicOrigin = "https://assets.gopheratlas.com"
const ImmutableCache = "public, max-age=31536000, immutable"

type Summary struct {
	ID       int64  `json:"id"`
	URL      string `json:"url"`
	MIMEType string `json:"mimeType"`
	Width    int64  `json:"width"`
	Height   int64  `json:"height"`
	ByteSize int64  `json:"byteSize"`
}
type Actions struct {
	Delete  bool `json:"delete"`
	Restore bool `json:"restore"`
}
type Asset struct {
	Summary
	SHA256    string  `json:"sha256"`
	CreatedAt int64   `json:"createdAt"`
	DeletedAt *int64  `json:"deletedAt"`
	Actions   Actions `json:"actions"`
}
type Page struct {
	Items      []Asset `json:"items"`
	NextCursor *int64  `json:"nextCursor"`
}

func Public(a dbsqlc.Asset, policies ...markdown.Policy) Summary {
	policy := markdown.Policy{}
	if len(policies) > 0 {
		policy = policies[0]
	}
	return Summary{a.ID, policy.AssetBaseURL() + "/" + a.ObjectKey, a.MimeType, a.Width, a.Height, a.ByteSize}
}
func (s *Service) dto(a dbsqlc.Asset, u dbsqlc.User) Asset {
	var deleted *int64
	if a.DeletedAt.Valid {
		deleted = &a.DeletedAt.Int64
	}
	return Asset{Public(a, s.policy), a.Sha256, a.CreatedAt, deleted, Actions{policy.CanManageAssets(u) && deleted == nil, policy.CanManageAssets(u) && deleted != nil}}
}
func Cover(ctx context.Context, q *dbsqlc.Queries, id *int64, policies ...markdown.Policy) (*Summary, error) {
	if id == nil {
		return nil, nil
	}
	a, err := q.GetAsset(ctx, *id)
	if err != nil {
		return nil, fault.Unavailable
	}
	summary := Public(a, policies...)
	return &summary, nil
}
func ValidateCover(ctx context.Context, q *dbsqlc.Queries, id *int64) error {
	if id == nil {
		return nil
	}
	if *id <= 0 {
		return fault.AssetInvalid
	}
	a, err := q.GetAsset(ctx, *id)
	if errors.Is(err, sql.ErrNoRows) {
		return fault.AssetInvalid
	}
	if err != nil {
		return fault.Unavailable
	}
	if a.DeletedAt.Valid {
		return fault.AssetDeleted
	}
	return nil
}

type ImageInfo struct {
	SHA256, Key, MIME string
	Width, Height     int64
}

func Inspect(data []byte) (ImageInfo, error) {
	if len(data) > MaxFileBytes {
		return ImageInfo{}, fault.AssetTooLarge
	}
	if len(data) == 0 {
		return ImageInfo{}, fault.AssetInvalid
	}
	mime := http.DetectContentType(data)
	ext := map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}[mime]
	if ext == "" {
		return ImageInfo{}, fault.AssetFormat
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return ImageInfo{}, fault.AssetInvalid
	}
	if format != ext && !(format == "jpeg" && ext == "jpg") {
		return ImageInfo{}, fault.AssetInvalid
	}
	w, h := int64(config.Width), int64(config.Height)
	if w <= 0 || h <= 0 || w > 16384 || h > 16384 || w*h > 100000000 {
		return ImageInfo{}, fault.AssetDimensions
	}
	sha := storage.Digest(data)
	return ImageInfo{sha, "media/sha256/" + sha[:2] + "/" + sha + "." + ext, mime, w, h}, nil
}

type Service struct {
	policy markdown.Policy
	db     *sql.DB
	store  storage.ObjectStore
	bucket string
}

func New(db *sql.DB, store storage.ObjectStore, bucket string, policies ...markdown.Policy) *Service {
	p := markdown.Policy{}
	if len(policies) > 0 {
		p = policies[0]
	}
	return &Service{db: db, store: store, bucket: bucket, policy: p}
}
func (s *Service) transact(ctx context.Context, p auth.Principal, fn func(*dbsqlc.Queries, dbsqlc.User, int64) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fault.Unavailable
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	q := dbsqlc.New(tx)
	current, err := auth.Reauthorize(ctx, q, p, now)
	if err != nil {
		return err
	}
	if !policy.CanUploadAsset(current.User) {
		return fault.Permission
	}
	if err = fn(q, current.User, now); err != nil {
		return err
	}
	if tx.Commit() != nil {
		return fault.Unavailable
	}
	return nil
}
func (s *Service) List(ctx context.Context, p auth.Principal, after int64, deleted bool) (Page, error) {
	result := Page{Items: []Asset{}}
	err := s.transact(ctx, p, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if after < 0 {
			return fault.Validation
		}
		if deleted && !policy.CanManageAssets(u) {
			return fault.Permission
		}
		rows, err := q.ListAssets(ctx, dbsqlc.ListAssetsParams{AfterID: after, IncludeDeleted: deleted, PageSize: 100})
		if err != nil {
			return fault.Unavailable
		}
		for _, r := range rows {
			result.Items = append(result.Items, s.dto(r, u))
		}
		if len(rows) == 100 {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}
func (s *Service) Upload(ctx context.Context, p auth.Principal, data []byte) (Asset, error) {
	var result Asset
	// This transaction closes before inspection/storage. Authorization is checked again after I/O.
	if err := s.transact(ctx, p, func(*dbsqlc.Queries, dbsqlc.User, int64) error { return nil }); err != nil {
		return result, err
	}
	if s.store == nil {
		return result, fault.PublicationNotConfigured
	}
	info, err := Inspect(data)
	if err != nil {
		return result, err
	}
	err = s.store.PutImmutable(ctx, s.bucket, info.Key, data, storage.Options{ContentType: info.MIME, CacheControl: ImmutableCache})
	if errors.Is(err, storage.ErrIntegrity) {
		return result, fault.StorageIntegrity
	}
	if err != nil {
		return result, fault.StorageUnavailable
	}
	err = s.transact(ctx, p, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		a, err := q.GetAssetByHash(ctx, info.SHA256)
		if err == nil {
			if a.DeletedAt.Valid {
				return fault.AssetDeleted
			}
			result = s.dto(a, u)
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return fault.Unavailable
		}
		a, err = q.CreateAsset(ctx, dbsqlc.CreateAssetParams{Sha256: info.SHA256, ObjectKey: info.Key, MimeType: info.MIME, ByteSize: int64(len(data)), Width: info.Width, Height: info.Height, CreatedBy: u.ID, CreatedAt: now})
		if err != nil {
			return fault.Unavailable
		}
		result = s.dto(a, u)
		return audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: "asset.uploaded", EntityType: "asset", EntityID: a.ID}, now)
	})
	return result, err
}
func (s *Service) SetDeleted(ctx context.Context, p auth.Principal, id int64, deleted bool) (Asset, error) {
	var result Asset
	err := s.transact(ctx, p, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		if !policy.CanManageAssets(u) {
			return fault.Permission
		}
		a, err := q.GetAsset(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return fault.NotFound
		}
		if err != nil {
			return fault.Unavailable
		}
		if a.DeletedAt.Valid == deleted {
			result = s.dto(a, u)
			return nil
		}
		a, err = q.SetAssetDeleted(ctx, dbsqlc.SetAssetDeletedParams{ID: id, DeletedAt: sql.NullInt64{Int64: now, Valid: deleted}})
		if err != nil {
			return fault.Unavailable
		}
		result = s.dto(a, u)
		action := "asset.restored"
		if deleted {
			action = "asset.deleted"
		}
		return audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: action, EntityType: "asset", EntityID: id}, now)
	})
	return result, err
}
