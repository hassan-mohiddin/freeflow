# crm-tools

Small Python helpers for cleaning the CRM export before import. No dependencies beyond the standard library.

- `dedupe.py`: `dedupe_contacts(contacts)` drops contacts that share an email address.
- `normalize.py`: `normalize_phone(text)` tidies phone numbers.

Run the tests with `python3 -m unittest`.
