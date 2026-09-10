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
         * Check SQLite reachability and expected identity schema
         * @description Read-only. Does not run migrations or depend on GitHub/R2/Cloudflare availability.
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
                code: string;
                message: string;
                requestId: string;
                fields?: {
                    [key: string]: string;
                };
            };
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
}
