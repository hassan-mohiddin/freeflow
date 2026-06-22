export async function sendSms(to: string, message: string, options: { retries: number }) {
  return { to, message, options };
}
