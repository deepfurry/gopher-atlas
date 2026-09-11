// Generated from contracts/openapi.yaml by make generate. Do not edit.
export interface paths {
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check process liveness
         * @description Check process liveness
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check SQLite and complete identity/editorial schema version 2
         * @description Read-only version and column probes. A P0-1-only database is not ready until migration 2 is explicitly applied. Never migrates or contacts external services.
         */
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/github": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Start browser-bound GitHub OAuth
         * @description Start browser-bound GitHub OAuth
         */
        get: operations["startGitHubLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/github/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consume state once and resolve GitHub identity
         * @description Successful login rotates the prior session and issues session/CSRF cookies, then redirects to /. Unknown identities become pending. Disabled accounts are rejected. Provider access tokens are discarded after numeric identity lookup.
         */
        get: operations["completeGitHubLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke the current session and expire cookies
         * @description Available to active and pending sessions. Requires Origin and CSRF. Server-side revocation precedes cookie removal. Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read current identity and server-derived permissions
         * @description Valid pending sessions may read this endpoint. Disabled users are rejected. No tokens or hashes are returned.
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List users as an active Admin
         * @description List users as an active Admin
         */
        get: operations["listUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a user as an active Admin
         * @description Read a user as an active Admin
         */
        get: operations["getUser"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users/{id}/actions/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * approve a user as an active Admin
         * @description Approve a pending account as Editor or Reviewer. Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        post: operations["approveUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users/{id}/actions/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * disable a user as an active Admin
         * @description Disable and revoke all sessions atomically. Reject disabling the last active Admin with last_admin_required. Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        post: operations["disableUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users/{id}/actions/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * enable a user as an active Admin
         * @description Enable a disabled user without restoring revoked sessions. The user must sign in again. Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        post: operations["enableUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/users/{id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Change a user role as an active Admin
         * @description Reject demoting the last active Admin with last_admin_required. Permissions are resolved server-side on each request. Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        put: operations["changeUserRole"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/authors/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the active user author profile
         * @description Read the active user author profile
         */
        get: operations["getOwnProfile"];
        /**
         * Update the active user author profile
         * @description Update the active user author profile Requires the exact configured Origin and a session-bound X-CSRF-Token header.
         */
        put: operations["updateOwnProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List visible content
         * @description Visibility is applied inside the query, before pagination. Only Admin may include archived. Reviewer sees others only while in review, with immutable pending titles.
         */
        get: operations["listContent"];
        put?: never;
        /**
         * Create identity and initial Draft
         * @description Active roles create own Curated/Post/Note. Topic requires Admin. Initial version 1 may be incomplete; creator/owner/byline are the actor. Atomic creation audit.
         */
        post: operations["createContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read visible content detail
         * @description Reviewer inspecting another owner sees pending immutable material and no mutable Draft.
         */
        get: operations["getContent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Replace Draft with expected version
         * @description Owner/Admin only, not archived or in_review. Saving synced changes state to draft and preserves published selection. No Audit event.
         */
        put: operations["saveDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List immutable revision summaries
         * @description Reviewer viewing another owner may list only the current pending revision. after is exclusive revisionNo.
         */
        get: operations["listRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/revisions/{revisionNo}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read immutable Revision with relations and review
         * @description Visibility follows Content policy. Reviewer viewing another owner may fetch only the current pending revision.
         */
        get: operations["getRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/revisions/{revisionNo}/actions/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copy a historical Revision into Draft
         * @description Owner/Admin, expected current Draft version, not archived/in_review. Copy fields/tags/topic order and bump version; state draft. Preserve published pointer and immutable history. Non-Admin cannot use restoration to change featured.
         */
        post: operations["restoreRevision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/submit-review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Capture immutable Revision for review
         * @description Owner/Admin from draft or changes_requested, expected Draft version. Complete validation and early route conflict check, snapshot relations, set exact pending pointer and audit.
         */
        post: operations["submitReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/withdraw-review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Withdraw pending review
         * @description Owner/Admin, in_review only. Keep Revision, clear pending, state draft and audit.
         */
        post: operations["withdrawReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/request-changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Request changes on exact pending Revision
         * @description Reviewer/Admin. Reviewer cannot be owner or revision byline; Admin bypasses. Required safe Markdown comment. Append terminal review, clear pending and state changes_requested atomically.
         */
        post: operations["requestChanges"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Select a published immutable Revision
         * @description Reviewed mode: Reviewer/Admin, exact pending revisionId with owner/byline self-review prohibition except Admin. Direct mode: Admin from draft/changes_requested, expected Draft version, create new immutable revision without fake approval. Topic targets must be published/unarchived. Route, pointer, review if any and audit commit together. Direct audit action is content.published_direct. No R2, generation, jobs or deploy hook.
         */
        post: operations["publishContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/unpublish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Clear published selection
         * @description Admin only, requires currently selected publication. Clear published and pending, state draft. Preserve revision/review/route history.
         */
        post: operations["unpublishContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Archive content
         * @description Admin only. Set archive time, clear published/pending, state draft. Historical routes remain permanently reserved.
         */
        post: operations["archiveContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/actions/restore-archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore archived identity to draft
         * @description Admin only. Clear archive time; remain draft without republishing.
         */
        post: operations["restoreArchivedContent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List review queue or history
         * @description Reviewer/Admin. Pending queue is immutable revision data and excludes reviewer owner/byline self-review. History contains immutable terminal reviews. Each view has its own cursor IDs.
         */
        get: operations["listReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List selectable tags
         * @description All active roles. No hard delete in P0-2.
         */
        get: operations["listTags"];
        put?: never;
        /**
         * Create tag
         * @description Admin only; normalized name and explicit slug must be unique. Atomic audit.
         */
        post: operations["createTag"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/tags/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update tag
         * @description Admin only. Explicit slug is persisted; changing name never computes a new slug. Atomic audit.
         */
        put: operations["updateTag"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List safe audit history
         * @description Admin/Reviewer only; Editor denied. Draft saves and failed mutations are omitted.
         */
        get: operations["listAudit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/v1/content/{id}/routes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List permanent route history
         * @description Content object visibility applies. Bounded keyset pages ordered by route row ID; redirects retain content identity and resolve directly to the current canonical route.
         */
        get: operations["listContentRoutes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Health: {
            /** @enum {string} */
            status: "ok";
        };
        User: {
            /** Format: int64 */
            id: number;
            /** Format: int64 */
            githubUserId: number;
            githubLogin: string;
            /** @enum {string} */
            role: "admin" | "reviewer" | "editor";
            /** @enum {string} */
            status: "pending" | "active" | "disabled";
            /** Format: int64 */
            createdAt: number;
            /** Format: int64 */
            updatedAt: number;
            /** Format: int64 */
            lastLoginAt: number | null;
        };
        Profile: {
            /** @description Stable numeric-identity slug; cannot be changed in P0-1. */
            readonly slug: string;
            displayName: string;
            bioMarkdown: string;
            readonly avatarUrl: string;
            websiteUrl: string;
        };
        ProfileInput: {
            displayName: string;
            /** @description At most 10000 UTF-8 bytes. CommonMark/GFM with shared Markdown safety validation; no H1, frontmatter, HTML/MDX, unsafe URLs or external images. */
            bioMarkdown: string;
            /** @description Empty or absolute HTTP(S) URL without credentials, whitespace or backslashes. */
            websiteUrl: string;
        };
        Permissions: {
            manageUsers: boolean;
            manageAuthorProfiles: boolean;
            editOwnProfile: boolean;
            review: boolean;
            publish: boolean;
            manageTaxonomy: boolean;
            retryBuild: boolean;
            viewAudit: boolean;
            viewMonitor: boolean;
            createTopic: boolean;
        };
        Me: {
            user: components["schemas"]["User"];
            profile: components["schemas"]["Profile"];
            permissions: components["schemas"]["Permissions"];
        };
        UserList: {
            users: components["schemas"]["User"][];
            /**
             * Format: int64
             * @description Use as after for the next page; null ends pagination.
             */
            nextCursor: number | null;
        };
        RoleInput: {
            /** @enum {string} */
            role: "admin" | "reviewer" | "editor";
        };
        ApprovalInput: {
            /** @enum {string} */
            role: "editor" | "reviewer";
        };
        ErrorResponse: {
            error: {
                /** @enum {string} */
                code: "authentication_required" | "account_pending" | "account_disabled" | "permission_denied" | "csrf_invalid" | "oauth_state_invalid" | "oauth_exchange_failed" | "validation_failed" | "not_found" | "last_admin_required" | "dependency_unavailable" | "internal_error" | "method_not_allowed" | "payload_too_large" | "content_version_conflict" | "invalid_editorial_state" | "route_conflict" | "review_revision_conflict" | "self_review_forbidden" | "content_archived" | "content_not_published" | "invalid_markdown" | "invalid_payload" | "tag_conflict" | "topic_target_unpublished";
                message: string;
                requestId: string;
                fields?: {
                    [key: string]: string;
                };
            };
        };
        /** @enum {string} */
        ContentType: "curated_article" | "post" | "note" | "topic";
        /** @enum {string} */
        EditorialState: "draft" | "in_review" | "changes_requested" | "synced";
        /** @description Content identity reference. Array order becomes one-based position. Self and duplicate targets are invalid. Unpublished targets are allowed until Topic publication. */
        TopicEntry: {
            /** Format: int64 */
            targetContentId: number;
        };
        PostPayload: Record<string, never>;
        NotePayload: {
            group?: string;
            groupSlug?: string;
            /** Format: int64 */
            order?: number;
        };
        TopicPayload: {
            /** Format: int64 */
            order?: number;
        };
        RelatedLink: {
            label: string;
            /** @description Absolute safe HTTP(S) URL. */
            url: string;
        };
        CuratedPayload: {
            /** @description Required and absolute HTTP(S) before submission; empty allowed in incomplete drafts. */
            sourceUrl?: string;
            /** @description Empty or absolute safe HTTP(S) URL. */
            originalUrl?: string;
            sourceAuthor?: string;
            sourceName?: string;
            /** @description Empty or valid YYYY-MM-DD date. */
            sourcePublishedAt?: string;
            sourceLanguage?: string;
            difficulty?: string;
            rating?: string;
            mustRead?: boolean;
            relatedLinks?: components["schemas"]["RelatedLink"][];
        };
        /** @description Subtype is determined by immutable Content.type. Unknown fields are rejected for that type. Omitted known subtype fields receive their Go zero/default values, then validated structs are marshaled canonically. Note group/groupSlug and Curated sourceUrl must be complete before submission/publication. payloadSchemaVersion is always 1. */
        TypedPayload: components["schemas"]["PostPayload"] | components["schemas"]["NotePayload"] | components["schemas"]["TopicPayload"] | components["schemas"]["CuratedPayload"];
        /** @description Complete replacement snapshot; every property is required. version is the expected current Draft version. Fields, tags and topic entries commit atomically, incrementing version once. A stale version returns 409 content_version_conflict without partial writes. Only Admin may change featured or assign another byline. Topic cannot use tags; other types cannot use topic entries. */
        DraftInput: {
            /** Format: int64 */
            version: number;
            /** @description May be empty while authoring; required before submission/publication. */
            title: string;
            slug: string;
            summary: string;
            /** @description At most 524288 UTF-8 bytes. Server CommonMark/GFM safety rules reject H1, frontmatter, raw HTML/MDX, unsafe URLs and uncontrolled images. */
            bodyMarkdown: string;
            /** Format: int64 */
            bylineUserId: number;
            /** @description Empty while authoring, otherwise bounded language tag; required before submission. */
            language: string;
            featured: boolean;
            seoTitle: string;
            seoDescription: string;
            payload: components["schemas"]["TypedPayload"];
            tagIds: number[];
            topicEntries: components["schemas"]["TopicEntry"][];
        };
        Draft: {
            /** Format: int64 */
            version: number;
            /** @description May be empty while authoring; required before submission/publication. */
            title: string;
            slug: string;
            summary: string;
            /** @description At most 524288 UTF-8 bytes. Server CommonMark/GFM safety rules reject H1, frontmatter, raw HTML/MDX, unsafe URLs and uncontrolled images. */
            bodyMarkdown: string;
            /** Format: int64 */
            bylineUserId: number;
            /** @description Empty while authoring, otherwise bounded language tag; required before submission. */
            language: string;
            featured: boolean;
            seoTitle: string;
            seoDescription: string;
            payload: components["schemas"]["TypedPayload"];
            tagIds: number[];
            topicEntries: components["schemas"]["TopicEntry"][];
            /** @constant */
            payloadSchemaVersion: 1;
            /** Format: int64 */
            updatedBy: number;
            /** Format: int64 */
            updatedAt: number;
        };
        /** @description Published selection is independent from editorialState. Editing a synced draft changes state to draft without changing the published revision. */
        ContentSummary: {
            /** Format: int64 */
            id: number;
            type: components["schemas"]["ContentType"];
            /** Format: int64 */
            ownerUserId: number;
            editorialState: components["schemas"]["EditorialState"];
            /** Format: int64 */
            pendingReviewRevisionId: number | null;
            /** Format: int64 */
            publishedRevisionId: number | null;
            title: string;
            /** Format: int64 */
            createdBy: number;
            /** Format: int64 */
            createdAt: number;
            /** Format: int64 */
            updatedAt: number;
            /** Format: int64 */
            firstPublishedAt: number | null;
            /** Format: int64 */
            lastPublishedAt: number | null;
            /** Format: int64 */
            archivedAt: number | null;
        };
        /** @description Permanently owned path. At most one canonical per Content. Redirects resolve by content identity to the current canonical, without chains. Unpublish/archive never release paths. */
        Route: {
            path: string;
            /** @enum {string} */
            kind: "canonical" | "redirect";
        };
        /** @description Editors see their own content. Reviewer access to another owner is limited to an in-review immutable pending revision; draft is null. Admin sees all, including archived. A completed action may return summary with null draft/pendingRevision when the actor no longer has view access. */
        Content: {
            /** Format: int64 */
            id: number;
            type: components["schemas"]["ContentType"];
            /** Format: int64 */
            ownerUserId: number;
            editorialState: components["schemas"]["EditorialState"];
            /** Format: int64 */
            pendingReviewRevisionId: number | null;
            /** Format: int64 */
            publishedRevisionId: number | null;
            title: string;
            /** Format: int64 */
            createdBy: number;
            /** Format: int64 */
            createdAt: number;
            /** Format: int64 */
            updatedAt: number;
            /** Format: int64 */
            firstPublishedAt: number | null;
            /** Format: int64 */
            lastPublishedAt: number | null;
            /** Format: int64 */
            archivedAt: number | null;
            draft: components["schemas"]["Draft"] | null;
            pendingRevision: components["schemas"]["Revision"] | null;
            routes: components["schemas"]["Route"][];
            /**
             * Format: int64
             * @description Exclusive cursor for GET /content/{id}/routes when more route history may exist.
             */
            nextRouteCursor: number | null;
        };
        /** @enum {string} */
        ReviewDecision: "changes_requested" | "approved";
        Review: {
            /** Format: int64 */
            id: number;
            /** Format: int64 */
            contentId: number;
            /** Format: int64 */
            revisionId: number;
            /** Format: int64 */
            reviewerUserId: number;
            decision: components["schemas"]["ReviewDecision"];
            /** @description Safe Markdown, at most 16384 UTF-8 bytes. */
            commentMarkdown: string;
            /** Format: int64 */
            createdAt: number;
        };
        RevisionSummary: {
            /** Format: int64 */
            id: number;
            /** Format: int64 */
            contentId: number;
            /** Format: int64 */
            revisionNo: number;
            title: string;
            slug: string;
            /** Format: int64 */
            bylineUserId: number;
            /** Format: int64 */
            createdBy: number;
            /** Format: int64 */
            createdAt: number;
            pending: boolean;
            published: boolean;
        };
        /** @description Immutable persisted fields, typed payload and relation snapshot. Restore copies to Draft and never updates this Revision or the published pointer. */
        Revision: {
            /** Format: int64 */
            id: number;
            /** Format: int64 */
            contentId: number;
            /** Format: int64 */
            revisionNo: number;
            /** @description May be empty while authoring; required before submission/publication. */
            title: string;
            slug: string;
            summary: string;
            /** @description At most 524288 UTF-8 bytes. Server CommonMark/GFM safety rules reject H1, frontmatter, raw HTML/MDX, unsafe URLs and uncontrolled images. */
            bodyMarkdown: string;
            /** Format: int64 */
            bylineUserId: number;
            /** @description Empty while authoring, otherwise bounded language tag; required before submission. */
            language: string;
            featured: boolean;
            seoTitle: string;
            seoDescription: string;
            payload: components["schemas"]["TypedPayload"];
            tagIds: number[];
            topicEntries: components["schemas"]["TopicEntry"][];
            /** @constant */
            payloadSchemaVersion: 1;
            /** Format: int64 */
            createdBy: number;
            /** Format: int64 */
            createdAt: number;
            pending: boolean;
            published: boolean;
            review: components["schemas"]["Review"] | null;
        };
        PendingReview: {
            /** Format: int64 */
            revisionId: number;
            /** Format: int64 */
            contentId: number;
            /** Format: int64 */
            revisionNo: number;
            title: string;
            /** Format: int64 */
            ownerUserId: number;
            /** Format: int64 */
            bylineUserId: number;
            /** Format: int64 */
            submittedAt: number;
        };
        /** @description Admin only. Names are trimmed, whitespace collapsed and lowercased for deterministic uniqueness. Slug is explicit and is never recomputed from name. */
        TagInput: {
            name: string;
            slug: string;
            description: string;
        };
        Tag: {
            /** Format: int64 */
            id: number;
            name: string;
            slug: string;
            description: string;
            /** Format: int64 */
            createdBy: number;
            /** Format: int64 */
            createdAt: number;
            /** Format: int64 */
            updatedAt: number;
        };
        /** @description Append-only and transactionally coupled to mutations. Contains no body, review comment, typed payload, credential or browser token. Draft save/autosave is not audited. */
        AuditEvent: {
            /** Format: int64 */
            id: number;
            /** Format: int64 */
            actorUserId: number;
            /** @enum {string} */
            action: "auth.login" | "user.approved" | "user.role_changed" | "user.disabled" | "user.enabled" | "author.profile_updated" | "content.created" | "content.submitted" | "content.review_withdrawn" | "content.changes_requested" | "content.published" | "content.published_direct" | "content.unpublished" | "content.archived" | "content.archive_restored" | "content.revision_restored" | "tag.created" | "tag.updated";
            /** @enum {string} */
            entityType: "user" | "author" | "content" | "tag";
            /** Format: int64 */
            entityId: number;
            /** Format: int64 */
            revisionId: number | null;
            metadata: {
                /** @enum {string} */
                role?: "admin" | "reviewer" | "editor";
                /** @enum {string} */
                status?: "pending" | "active" | "disabled";
            };
            /** @description Server-generated UUID or empty for a non-HTTP operation. Never an incoming request header. */
            requestId: string;
            /** Format: int64 */
            createdAt: number;
        };
        ContentList: {
            items: components["schemas"]["ContentSummary"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        RevisionList: {
            items: components["schemas"]["RevisionSummary"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        PendingReviewList: {
            items: components["schemas"]["PendingReview"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        ReviewHistoryList: {
            items: components["schemas"]["Review"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        TagList: {
            items: components["schemas"]["Tag"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        AuditList: {
            items: components["schemas"]["AuditEvent"][];
            /**
             * Format: int64
             * @description Use as after for the next page. Null ends pagination. A full final page may yield one empty next page.
             */
            nextCursor: number | null;
        };
        CreateContentInput: {
            type: components["schemas"]["ContentType"];
        };
        VersionInput: {
            /** Format: int64 */
            version: number;
        };
        RequestChangesInput: {
            /** Format: int64 */
            revisionId: number;
            /** @description Required nonblank safe Markdown, at most 16384 UTF-8 bytes. */
            commentMarkdown: string;
        };
        PublishReviewedInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "reviewed";
            /** Format: int64 */
            revisionId: number;
            /** @description Optional safe Markdown, at most 16384 UTF-8 bytes. */
            commentMarkdown?: string;
        };
        PublishDirectInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "direct";
            /** Format: int64 */
            version: number;
        };
        PublishInput: components["schemas"]["PublishReviewedInput"] | components["schemas"]["PublishDirectInput"];
        RouteList: {
            items: components["schemas"]["Route"][];
            /** Format: int64 */
            nextCursor: number | null;
        };
    };
    responses: {
        /** @description Stable error envelope without provider/SQL details. See error.code for classification. */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            default: components["responses"]["Error"];
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    startGitHubLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect without exposing OAuth credentials to the Admin URL. */
            302: {
                headers: {
                    /** @description Redirect destination */
                    Location?: string;
                    /** @description Host-only cookies with SameSite=Lax; Secure for HTTPS, HttpOnly except CSRF. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    completeGitHubLogin: {
        parameters: {
            query: {
                /** @description One-time value must match the initiating browser cookie. */
                state: string;
                /** @description Short-lived provider code; never logged. */
                code: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect without exposing OAuth credentials to the Admin URL. */
            303: {
                headers: {
                    /** @description Redirect destination */
                    Location?: string;
                    /** @description Host-only cookies with SameSite=Lax; Secure for HTTPS, HttpOnly except CSRF. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            403: components["responses"]["Error"];
            502: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked and cookies expired. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listUsers: {
        parameters: {
            query?: {
                /** @description Exclusive user ID cursor; pages contain at most 100 users. */
                after?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    getUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    approveUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApprovalInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    disableUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    enableUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    changeUserRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    getOwnProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Profile"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    updateOwnProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProfileInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Profile"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listContent: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
                /** @description Admin only when true. */
                includeArchived?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    createContent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateContentInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    getContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    saveDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DraftInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Draft"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listRevisions: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
            };
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevisionList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    getRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
                /** @description Immutable per-content revision number. */
                revisionNo: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Revision"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    restoreRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
                /** @description Immutable per-content revision number. */
                revisionNo: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    submitReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    withdrawReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    requestChanges: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RequestChangesInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    publishContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    unpublishContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    archiveContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    restoreArchivedContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Content"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listReviews: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
                /** @description Pending immutable submissions or terminal review history. */
                view?: "pending" | "history";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PendingReviewList"] | components["schemas"]["ReviewHistoryList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listTags: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    createTag: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    updateTag: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagInput"];
            };
        };
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listAudit: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
    listContentRoutes: {
        parameters: {
            query?: {
                /** @description Exclusive keyset cursor; default 0, fixed maximum 100 results. Revision lists use revisionNo; other lists use the returned row ID. */
                after?: number;
            };
            header?: never;
            path: {
                /** @description Content or Tag identity. */
                id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RouteList"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
            default: components["responses"]["Error"];
        };
    };
}
