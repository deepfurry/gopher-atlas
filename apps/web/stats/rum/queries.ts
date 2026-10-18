// Fixed account-scoped queries only; no caller-provided GraphQL or bot filters.
export const settingsQuery = `query RumSettings($accountTag: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      settings {
        rumPageloadEventsAdaptiveGroups {
          enabled availableFields maxDuration maxPageSize notOlderThan maxNumberOfFields
        }
      }
    }
  }
}`;

export const siteQuery = `query RumDailySite($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $limit: uint64!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: $limit
        filter: { siteTag: $siteTag, requestHost: "gopheratlas.com", datetime_geq: $start, datetime_lt: $end, bot: 0 }
      ) {
        dimensions { date requestHost }
        count
        sum { visits }
        avg { sampleInterval }
      }
    }
  }
}`;

export const pagesQuery = `query RumDailyPages($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $limit: uint64!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: $limit
        orderBy: [count_DESC]
        filter: { siteTag: $siteTag, requestHost: "gopheratlas.com", datetime_geq: $start, datetime_lt: $end, bot: 0 }
      ) {
        dimensions { date requestHost requestPath }
        count
        sum { visits }
        avg { sampleInterval }
      }
    }
  }
}`;

export const referrersQuery = `query RumDailyReferrers($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $limit: uint64!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: $limit
        orderBy: [sum_visits_DESC]
        filter: { siteTag: $siteTag, requestHost: "gopheratlas.com", datetime_geq: $start, datetime_lt: $end, bot: 0 }
      ) {
        dimensions { date requestHost refererHost }
        count
        sum { visits }
        avg { sampleInterval }
      }
    }
  }
}`;
