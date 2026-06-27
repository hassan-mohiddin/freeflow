import { sendEmail } from './sendEmail';
import { sendSms } from './sendSms';
import { logNotificationFailure } from './telemetry';

export async function inviteUser(user: { email: string; phone?: string }, teamName: string) {
  try {
    await sendEmail(user.email, `Join ${teamName}`, { retries: 2, template: 'team-invite' });
  } catch (error) {
    logNotificationFailure('team-invite-email', user.email, error);
    if (user.phone) {
      await sendSms(user.phone, `Join ${teamName}`, { retries: 1 });
    }
  }
}

export async function sendInvoiceReminder(user: { email: string; phone?: string }, invoiceId: string) {
  try {
    await sendEmail(user.email, `Invoice ${invoiceId} is due`, { retries: 3, template: 'invoice-reminder' });
  } catch (error) {
    logNotificationFailure('invoice-reminder-email', user.email, error);
    if (user.phone) {
      await sendSms(user.phone, `Invoice ${invoiceId} is due`, { retries: 2 });
    }
  }
}
