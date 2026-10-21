"""Field normalisation for the CRM export."""

import re


def normalize_phone(text):
    """Digits only, keeping a leading + for international numbers."""
    text = (text or "").strip()
    digits = re.sub(r"\D", "", text)
    return ("+" + digits) if text.startswith("+") else digits
