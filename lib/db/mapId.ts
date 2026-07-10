/**
 * MongoDB's wire documents store the primary key as `_id`. Every consumer in
 * this app expects `.id` instead — that's what Prisma's `@map("_id")` used to
 * remap transparently inside Prisma Client. Data API has no such client-side
 * remapping, so repositories must translate at this boundary: query filters
 * still target the real `_id` field, but everything returned to callers is
 * shaped with `id`.
 */
export type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

export function mapId<T extends { _id: string }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id } as Omit<T, "_id"> & { id: string };
}
