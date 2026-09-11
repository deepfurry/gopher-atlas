package policy

import dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"

func CanUploadAsset(u dbsqlc.User) bool  { return For(u.Role, u.Status).UploadAssets }
func CanManageAssets(u dbsqlc.User) bool { return For(u.Role, u.Status).ManageAssets }
