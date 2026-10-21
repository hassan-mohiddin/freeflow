import unittest

from dedupe import dedupe_contacts
from normalize import normalize_phone


class DedupeTest(unittest.TestCase):
    def test_distinct_contacts_are_kept(self):
        contacts = [
            {"name": "Ann", "email": "ann@example.com"},
            {"name": "Raj", "email": "raj@example.com"},
        ]
        self.assertEqual(dedupe_contacts(contacts), contacts)

    def test_same_email_is_one_contact(self):
        contacts = [
            {"name": "Ann", "email": "ann@example.com"},
            {"name": "Ann", "email": "ann@example.com"},
        ]
        self.assertEqual(len(dedupe_contacts(contacts)), 1)


class NormalizeTest(unittest.TestCase):
    def test_phone_keeps_digits_and_plus(self):
        self.assertEqual(normalize_phone(" +44 (0)20 7946-0018 "), "+440207946" + "0018")


if __name__ == "__main__":
    unittest.main()
