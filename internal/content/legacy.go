package content

import (
	"context"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

// LegacyDates is used exclusively by the offline legacy import command. There is
// no HTTP route for this operation. Revision/Audit timestamps remain import time.
type LegacyDates struct{ First, Last int64 }

// PublishLegacy preserves reliable source dates inside the same direct-publish
// transaction, before its generation/job commits. A worker cannot export an
// intermediate publication with migration-day timestamps.
func (s *Service) PublishLegacy(ctx context.Context, actor auth.Principal, id, version int64, dates LegacyDates) (Detail, error) {
	if dates.First < 0 || dates.Last < dates.First || dates.Last > time.Now().UnixMilli() {
		return Detail{}, fault.Validation
	}
	return s.publishDirect(ctx, actor, id, version, &dates)
}
