// Shared load-test identities. Signup and the database seed use the same
// emails and Telegram handles. Only the seed chooses the user id.

export function rosterFromEnv(env = process.env) {
  const total = positiveInt(env.VUS, 9600);
  const share = Number(env.REQUESTER_SHARE ?? 0.4);
  if (!(share > 0) || !(share < 1)) {
    throw new Error("REQUESTER_SHARE must be between 0 and 1");
  }
  const requesterCount = Math.round(total * share);
  const courierCount = total - requesterCount;
  return {
    total,
    share,
    requesters: Array.from({ length: requesterCount }, (_, index) => identity("r", index)),
    couriers: Array.from({ length: courierCount }, (_, index) => identity("c", index)),
  };
}

export function identity(role, index) {
  const prefix = role === "r" ? "lr" : "lc";
  return {
    email: `load-${role}-${index}@u.nus.edu`,
    name: role === "r" ? `Load Requester ${index}` : `Load Courier ${index}`,
    telegramHandle: `${prefix}${String(index).padStart(6, "0")}`,
    role,
  };
}

export function positiveInt(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}
