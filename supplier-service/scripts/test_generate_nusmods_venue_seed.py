import unittest

import generate_nusmods_venue_seed as generator


class GenerateNusmodsVenueSeedTest(unittest.TestCase):
    def test_emits_only_exact_coordinate_matches(self):
        venues, excluded = generator.build_venues(
            ["COM1-0207", "MISSING"],
            {
                "COM1-0207": {
                    "roomName": "Seminar Room 7",
                    "floor": 2,
                    "location": {"x": 103.774, "y": 1.295},
                }
            },
        )

        self.assertEqual(1, len(venues))
        self.assertEqual("COM1", venues[0].building)
        self.assertEqual("2", venues[0].floor)
        self.assertEqual(
            [("MISSING", "No exact coordinate entry")],
            excluded,
        )

    def test_supplier_ids_are_stable_for_the_same_venue_code(self):
        coordinate = {
            "LT16": {
                "roomName": "Lecture Theatre 16",
                "floor": 1,
                "location": {"x": 103.7738, "y": 1.2939},
            }
        }

        first, _ = generator.build_venues(["LT16"], coordinate)
        second, _ = generator.build_venues(["LT16"], coordinate)

        self.assertEqual(first[0].supplier_id, second[0].supplier_id)

    def test_unreasonable_source_floor_is_left_unknown(self):
        venues, _ = generator.build_venues(
            ["S13-M-08"],
            {
                "S13-M-08": {
                    "roomName": "Computer Lab 2",
                    "floor": 105,
                    "location": {"x": 103.7792, "y": 1.2967},
                }
            },
        )

        self.assertIsNone(venues[0].floor)

    def test_duplicate_semester_code_is_reported(self):
        venues, excluded = generator.build_venues(
            ["LT16", "LT16"],
            {
                "LT16": {
                    "roomName": "Lecture Theatre 16",
                    "floor": 1,
                    "location": {"x": 103.7738, "y": 1.2939},
                }
            },
        )

        self.assertEqual(1, len(venues))
        self.assertEqual(
            [("LT16", "Duplicate semester venue code")],
            excluded,
        )


if __name__ == "__main__":
    unittest.main()
