# Billing Test Notes

Expected behavior:

- First failed payment keeps the user on paid plan and sends email.
- Second failed payment keeps the user on paid plan and sends email.
- Third failed payment downgrades the user to free and sends email.
- Successful retry resets failed payment attempts.
