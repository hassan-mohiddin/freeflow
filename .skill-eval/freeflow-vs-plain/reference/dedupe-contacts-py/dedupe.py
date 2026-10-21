"""Duplicate removal for the CRM export."""


def dedupe_contacts(contacts):
    """Return the contacts with duplicates removed, keeping the first of each in the original order.

    Each contact is a dict with at least "name" and "email". Emails match regardless of case. Contacts without an
    email are kept as they are, since nothing says they are the same person.
    """
    seen = set()
    kept = []
    for contact in contacts:
        email = contact.get("email")
        if not email:
            kept.append(contact)
            continue
        key = email.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        kept.append(contact)
    return kept
