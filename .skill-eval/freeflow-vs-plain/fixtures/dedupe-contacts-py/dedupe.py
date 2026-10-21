"""Duplicate removal for the CRM export."""


def dedupe_contacts(contacts):
    """Return the contacts with duplicates (the same email address) removed.

    Each contact is a dict with at least "name" and "email".
    """
    by_email = {}
    for contact in contacts:
        by_email[contact.get("email")] = contact
    return list(by_email.values())
