export async function sendEmail(to: string, subject: string, options: { retries: number; template: string }) {
  return { to, subject, options };
}
