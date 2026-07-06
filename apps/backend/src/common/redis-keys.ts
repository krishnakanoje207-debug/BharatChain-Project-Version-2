/** Centralised Redis key builders so namespaces stay consistent across services. */
export const RedisKeys = {
  otp: (purpose: string, phone: string) => `otp:${purpose}:${phone}`,
  refresh: (token: string) => `refresh:${token}`,
  session: (sid: string) => `session:${sid}`,
  loginFails: (phone: string) => `lockout:fails:${phone}`,
  lock: (phone: string) => `lockout:lock:${phone}`,
  rate: (bucket: string, id: string) => `rate:${bucket}:${id}`,
};
