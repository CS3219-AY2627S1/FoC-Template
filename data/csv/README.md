# Supplier seed sources

The active application seed is `supplier-seed-data.csv` in this directory.
It contains 131 entries: the original 21 plus 110 campus locations added on
10 November 2026 using the NUS sources below. All `ImageURL` cells are empty.

## Field conventions

- Keep the existing ten headers, Windows-1252 encoding, and CRLF line endings.
- The original 21 entries retain their names, locations, coordinates, and hours.
  Only their image URLs were cleared. Those older values have not been revalidated.
- New names and buildings come from the listed NUS directories. Categories and
  pickup instructions are application labels written for this seed. An outlet
  and its containing canteen are distinct pickup choices. A library entrance
  and a printer inside that library are also distinct choices.
- New coordinates are blank because the directories do not supply coordinates.
  Blank floors mean the source did not identify a floor; they do not mean level 1.
- Where a single unambiguous weekday term-time interval is published, the new
  opening and closing fields use that interval in Singapore local time.
  These fields cannot express weekends, holidays, split service, or vacations.
  Check the source for those exceptions. Overnight closing (for example 0200hrs)
  is the following day. Variable canteen hours and 24-hour outlets are left blank
  rather than encoding a closing time of 23:59 as an exact 24-hour schedule.
- Printing points are limited to locations explicitly marked as offering printing
  in the library FAQ. Photocopy-only collection areas are excluded. The existing
  `Printer @ Com 2` near LT19 already covers the Computing LT19 printing location,
  so it was not added again. Printing and residence access depend on eligibility.
- `LANDMARK` entries are campus meeting points. Handover instructions use external
  entrances rather than assuming access to residences, libraries, or sports spaces.
- Hair Destination is excluded because the retail directory marks it temporarily
  closed. No individual unnamed food stalls were invented to increase the count.

## Coverage

Category totals include multi-category entries and therefore exceed 131.

| Category | Entries |
| --- | ---: |
| COFFEE | 19 |
| FOOD | 69 |
| LANDMARK | 37 |
| OTHERS | 3 |
| PRINTING | 13 |
| SHOPPING | 9 |

## Online sources

Sources checked on 10 November 2026.

| Key | NUS source |
| --- | --- |
| KR | [Kent Ridge dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/) |
| UT | [University Town dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/) |
| BTC | [Bukit Timah dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/bukit-timah/) |
| RET | [Campus retail](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/retail-outlets-in-kent-ridge-bukit-timah-and-university-town/) |
| PRINT | [NUS Libraries printing locations](https://libfaq.nus.edu.sg/faq?gid=71&qid=71360) |
| LIB | [NUS Libraries directory](https://www.nus.edu.sg/nuslibraries/spaces/our-libraries) |
| HALL | [NUS residence directory](https://osa.nus.edu.sg/about-osa/contact-us/) |
| RC | [University Town College Programme](https://www.nus.edu.sg/nusbulletin/ay202526/programmes/residential-college-programmes/university-town-college-programme/) |
| HOUSING | [Housing facilities](https://uci.nus.edu.sg/campus-life/housing-services/general-information-for-student-housing/facilities-amenities/) |
| SPORT | [Sports facilities](https://uci.nus.edu.sg/campus-life/campus-services/sports-recreation/facilities-operating-hours/) |
| MUSEUM | [NUS Museum](https://nus.edu.sg/museum/about-us) |
| UCC | [University Cultural Centre](https://uci.nus.edu.sg/campus-life/university-cultural-centre/) |
| NHM | [Natural History Museum](https://lkcnhm.nus.edu.sg/plan-your-visit/) |
| PC | [NUS IT PC clusters](https://nusit.nus.edu.sg/services/computers/pc-cluster/) |

## Per-entry provenance

CSV rows are one-based and include the header. Rows 2-22 are the original
provided seed. The table below maps every added entry to its source.

| CSV row | Name | Building | Source |
| ---: | --- | --- | --- |
| 23 | Bistro Box | College of Design and Engineering | KR |
| 24 | Burnt Cones | Medicine Block MD11 | KR |
| 25 | Burnt Cones | University Hall | KR |
| 26 | Cafe Delight | Ventus | KR |
| 27 | Chong Pang Tai Zhi Wei | The Deck | KR |
| 28 | CHAGEE | Yusof Ishak House | KR |
| 29 | Eureka Taste | Medicine Block MD6 | KR |
| 30 | Fong Seng Nasi Lemak | The Deck | KR |
| 31 | Frontier | Faculty of Science | KR |
| 32 | Li Ji Coffeehouse | Frontier | KR |
| 33 | Liang Ban Kung Fu | The Deck | KR |
| 34 | Makan Boleh | COM3 | KR |
| 35 | Mini Wok & Dim Sum | Yusof Ishak House | KR |
| 36 | Mixue | Frontier | KR |
| 37 | Nine Fresh | Faculty of Science | KR |
| 38 | Potato Corner | Yusof Ishak House | KR |
| 39 | PGP Aircon Canteen | Prince George's Park | KR |
| 40 | QQ Rice | Science Block S16 | KR |
| 41 | Sloppy B | University Sports Centre | KR |
| 42 | South & East | Shaw Foundation Alumni House | KR |
| 43 | Poonsti Cafe | Shaw Foundation Alumni House | KR |
| 44 | Starbucks | Science Block S9 | KR |
| 45 | Starbucks | College of Design and Engineering | KR |
| 46 | Taiwan Ichiban | Frontier | KR |
| 47 | Techno Edge | College of Design and Engineering | KR |
| 48 | TempuRamen | Yusof Ishak House | KR |
| 49 | The Acai Truck | Prince George's Park | KR |
| 50 | The Coffee Bean and Tea Leaf | COM3 | KR |
| 51 | The Deck | Faculty of Arts and Social Sciences | KR |
| 52 | The Spread | Mochtar Riady Building | KR |
| 53 | The Terrace | COM3 | KR |
| 54 | Uncle Penyet Fusion | Frontier | KR |
| 55 | Wild Skew | Yusof Ishak House | KR |
| 56 | Wok Express | Yusof Ishak House | KR |
| 57 | Wonderful Cafe | College of Design and Engineering | KR |
| 58 | Wonderful Cafe | Science Block S16 | KR |
| 59 | Bismillah Biryani | Stephen Riady Centre | UT |
| 60 | Fine Food | Town Plaza | UT |
| 61 | Flavours @ UTown | Stephen Riady Centre | UT |
| 62 | Hwang's Korean Restaurant | Town Plaza | UT |
| 63 | Jollibee | Town Plaza | UT |
| 64 | Mr Bean / Do Qoo | Town Plaza | UT |
| 65 | Makan Malah! | Town Plaza | UT |
| 66 | Starbucks | Education Resource Centre | UT |
| 67 | Subway | Stephen Riady Centre | UT |
| 68 | Supersnacks | Stephen Riady Centre | UT |
| 69 | The Royals Bistro | Town Plaza | UT |
| 70 | Sapore | Stephen Riady Centre | UT |
| 71 | TOMORO COFFEE | NUS College | UT |
| 72 | Triplets | Stephen Riady Centre | UT |
| 73 | Udon Don Bar | Town Plaza | UT |
| 74 | Waa Cow / Bueno Bueno | Stephen Riady Centre | UT |
| 75 | BTC Cafeteria | Bukit Timah Campus Block B | BTC |
| 76 | Cheers Unmanned Convenience Store | Yusof Ishak House | RET |
| 77 | FairPricexpress | Kent Vale | RET |
| 78 | FairPricexpress | Stephen Riady Centre | RET |
| 79 | OCBC @ NUS | Stephen Riady Centre | RET |
| 80 | NUS Co-op | Science LT27 | RET |
| 81 | Octobox | Stephen Riady Centre | RET |
| 82 | Skosk Beautique | Stephen Riady Centre | RET |
| 83 | Printer @ C J Koh Law Library Reading Room | C J Koh Law Library | PRINT |
| 84 | Printer @ C J Koh Law Library Copier Room | C J Koh Law Library | PRINT |
| 85 | Printer @ Central Library Level 4 | Central Library | PRINT |
| 86 | Printer @ Central Library Mainshelf Area | Central Library | PRINT |
| 87 | Printer @ Hon Sui Sen Memorial Library | Hon Sui Sen Memorial Library | PRINT |
| 88 | Printer @ Medicine+Science Library Level 2 | Medicine+Science Library | PRINT |
| 89 | Printer @ Medicine+Science Library Level 3 | Medicine+Science Library | PRINT |
| 90 | Printer @ AS8 Computer Room Level 2 | Blk AS8 | PRINT |
| 91 | Printer @ AS8 Computer Room Level 1 | Blk AS8 | PRINT |
| 92 | Printer @ PGPR Block 8 | Prince George's Park Block 8 | PRINT |
| 93 | Printer @ Raffles Hall | Raffles Hall | PRINT |
| 94 | Central Library | Central Library | LIB |
| 95 | C J Koh Law Library | C J Koh Law Library | LIB |
| 96 | Hon Sui Sen Memorial Library | Hon Sui Sen Memorial Library | LIB |
| 97 | Library@BTC | Library@BTC | LIB |
| 98 | Medicine+Science Library | Medicine+Science Library | LIB |
| 99 | Music Library | Music Library | LIB |
| 100 | Wan Boo Sow Chinese Library | Wan Boo Sow Chinese Library | LIB |
| 101 | Eusoff Hall | Eusoff Hall | HALL |
| 102 | Kent Ridge Hall | Kent Ridge Hall | HALL |
| 103 | King Edward VII Hall | King Edward VII Hall | HALL |
| 104 | Raffles Hall | Raffles Hall | HALL |
| 105 | Sheares Hall | Sheares Hall | HALL |
| 106 | Temasek Hall | Temasek Hall | HALL |
| 107 | Helix House | Helix House | HALL |
| 108 | LightHouse | LightHouse | HALL |
| 109 | Pioneer House | Pioneer House | HALL |
| 110 | Valour House | Valour House | HALL |
| 111 | Acacia College | Acacia College | RC |
| 112 | College of Alice & Peter Tan | College of Alice & Peter Tan | RC |
| 113 | Residential College 4 | Residential College 4 | RC |
| 114 | Tembusu College | Tembusu College | RC |
| 115 | Ridge View Residential College | Ridge View Residential College | HOUSING |
| 116 | NUS College | NUS College | HOUSING |
| 117 | UTown Residence | UTown Residence | HOUSING |
| 118 | Prince George's Park Residence | Prince George's Park | HOUSING |
| 119 | Swimming Pool @ Stephen Riady Centre | Stephen Riady Centre | SPORT |
| 120 | Swimming Pool @ University Sports Centre | University Sports Centre | SPORT |
| 121 | Fitness Gym @ Stephen Riady Centre | Stephen Riady Centre | SPORT |
| 122 | Fitness Gym @ University Sports Centre | University Sports Centre | SPORT |
| 123 | Badminton Courts @ MPSH 5 | MPSH 5 | SPORT |
| 124 | UTown Sports Hall 1 | Stephen Riady Centre | SPORT |
| 125 | Squash Courts @ University Sports Centre | University Sports Centre | SPORT |
| 126 | Table Tennis @ MPSH 1 | MPSH 1 | SPORT |
| 127 | Kent Ridge Outdoor Tennis Courts | Kent Ridge Outdoor Courts | SPORT |
| 128 | NUS Museum | University Cultural Centre | MUSEUM |
| 129 | University Cultural Centre | University Cultural Centre | UCC |
| 130 | Lee Kong Chian Natural History Museum | Lee Kong Chian Natural History Museum | NHM |
| 131 | PC Commons | Education Resource Centre | PC |
| 132 | Mac Commons | Education Resource Centre | PC |
