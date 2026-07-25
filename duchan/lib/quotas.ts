// מכסות — הן שומרות על העלות. תקרות קשיחות מהיום הראשון.

export const QUOTAS = {
  productsPerStore: 20,
  mediaBytesPerStore: 25 * 1024 * 1024, // 25MB
  storesPerParentEmail: 3,
  ordersPerIpPerStorePerDay: 5,
  maxUploadBytes: 25 * 1024 * 1024,
} as const;
