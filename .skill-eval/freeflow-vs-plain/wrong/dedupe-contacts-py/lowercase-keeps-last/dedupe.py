"""Wrong on purpose: matches emails without case, but still keeps the last contact seen."""


def dedupe_contacts(contacts):
    by_email = {}
    for contact in contacts:
        by_email[(contact.get("email") or "").lower()] = contact
    return list(by_email.values())
