import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Hadith } from "@hadith/shared-types";

import { type CollectionSummary, getCollectionHadiths, getCollectionList } from "@/lib/hadiths";

/**
 * Collection queries — the browse surface for all 15 collections. Kept here
 * (rather than inline) because the reading view paginates with
 * `useInfiniteQuery`, which is verbose enough to be worth centralizing.
 *
 * Collections are effectively immutable, so both queries cache for a day.
 */

/** One reading-order page; tune with the API's max (200). */
export const COLLECTION_PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** All 15 collections + counts for the Browse landing. */
export function useCollectionList() {
  return useQuery<CollectionSummary[]>({
    queryKey: ["collections"],
    queryFn: getCollectionList,
    staleTime: DAY_MS,
  });
}

/**
 * Paginated reading view for a single collection. Each page is `pageSize`
 * hadiths; `fetchNextPage` appends the next offset. `getNextPageParam`
 * returns undefined once a short page signals the end, which flips
 * `hasNextPage` off and stops `onEndReached` from looping.
 */
export function useCollectionHadiths(collection: string, pageSize = COLLECTION_PAGE_SIZE) {
  // The RPC caps p_limit at 200; clamp here so the "short page = end" check and
  // the offset math agree with what the server actually returns. Part of the
  // query key so different page sizes don't collide in the cache.
  const effectivePageSize = Math.min(pageSize, 200);
  return useInfiniteQuery<
    Hadith[],
    Error,
    InfiniteData<Hadith[], number>,
    [string, string, number],
    number
  >({
    queryKey: ["collection-hadiths", collection, effectivePageSize],
    queryFn: ({ pageParam }) => getCollectionHadiths(collection, effectivePageSize, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < effectivePageSize ? undefined : allPages.length * effectivePageSize,
    enabled: collection.length > 0,
    staleTime: DAY_MS,
  });
}
