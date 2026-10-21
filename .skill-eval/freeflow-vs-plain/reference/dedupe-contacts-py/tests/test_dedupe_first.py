import unittest

from dedupe import dedupe_contacts


class KeepFirstTest(unittest.TestCase):
    def test_first_contact_is_kept_in_order(self):
        contacts = [
            {"name": "Raj", "email": "raj@example.com"},
            {"name": "Ann", "email": "ann@example.com"},
            {"name": "Raj again", "email": "raj@example.com"},
        ]
        self.assertEqual([c["name"] for c in dedupe_contacts(contacts)], ["Raj", "Ann"])

    def test_email_case_is_ignored(self):
        contacts = [{"name": "Bob", "email": "Bob@Example.com"}, {"name": "bob", "email": "bob@example.com"}]
        self.assertEqual([c["name"] for c in dedupe_contacts(contacts)], ["Bob"])


if __name__ == "__main__":
    unittest.main()
