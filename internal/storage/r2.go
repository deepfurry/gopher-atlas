package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

type R2 struct{ client *s3.Client }

func NewR2(endpoint, key, secret string) *R2 {
	return &R2{client: s3.New(s3.Options{
		Region: "auto", BaseEndpoint: aws.String(endpoint), UsePathStyle: true,
		Credentials:                credentials.NewStaticCredentialsProvider(key, secret, ""),
		HTTPClient:                 &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		RetryMaxAttempts:           1,
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})}
}
func status(err error) int {
	var r *smithyhttp.ResponseError
	if errors.As(err, &r) {
		return r.HTTPStatusCode()
	}
	return 0
}
func safe(err error) error {
	if status(err) == 404 {
		return ErrMissing
	}
	return ErrUnavailable
}
func (r *R2) Head(ctx context.Context, bucket, key string) (Metadata, error) {
	out, err := r.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return Metadata{}, safe(err)
	}
	return Metadata{SHA256: out.Metadata["sha256"], ContentType: aws.ToString(out.ContentType), CacheControl: aws.ToString(out.CacheControl), Size: aws.ToInt64(out.ContentLength)}, nil
}
func (r *R2) Get(ctx context.Context, bucket, key string, limit int64) ([]byte, error) {
	if limit <= 0 || limit > MaxSnapshotBytes {
		return nil, ErrIntegrity
	}
	out, err := r.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return nil, safe(err)
	}
	defer out.Body.Close()
	if aws.ToInt64(out.ContentLength) > limit {
		return nil, ErrIntegrity
	}
	data, err := io.ReadAll(io.LimitReader(out.Body, limit+1))
	if err != nil {
		return nil, ErrUnavailable
	}
	if int64(len(data)) > limit {
		return nil, ErrIntegrity
	}
	return data, nil
}
func (r *R2) put(ctx context.Context, bucket, key string, data []byte, o Options, immutable bool) error {
	input := &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String(key), Body: bytes.NewReader(data), ContentLength: aws.Int64(int64(len(data))), ContentType: aws.String(o.ContentType), CacheControl: aws.String(o.CacheControl), Metadata: map[string]string{"sha256": Digest(data)}}
	if immutable {
		input.IfNoneMatch = aws.String("*")
	}
	_, err := r.client.PutObject(ctx, input)
	if err != nil {
		if immutable && (status(err) == 412 || status(err) == 409) {
			m, e := r.Head(ctx, bucket, key)
			if e != nil {
				return e
			}
			if m.SHA256 == Digest(data) {
				return nil
			}
			return ErrIntegrity
		}
		return safe(err)
	}
	return nil
}
func (r *R2) PutImmutable(ctx context.Context, bucket, key string, data []byte, o Options) error {
	m, err := r.Head(ctx, bucket, key)
	if err == nil {
		if m.SHA256 == Digest(data) {
			return nil
		}
		return ErrIntegrity
	}
	if !errors.Is(err, ErrMissing) {
		return err
	}
	return r.put(ctx, bucket, key, data, o, true)
}
func (r *R2) Put(ctx context.Context, bucket, key string, data []byte, o Options) error {
	if key != "latest.json" {
		return ErrIntegrity
	}
	return r.put(ctx, bucket, key, data, o, false)
}
