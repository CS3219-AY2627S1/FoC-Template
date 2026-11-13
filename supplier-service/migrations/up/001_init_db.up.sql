-- AI Assistance Disclosure:
-- Tool: Gemini (model: 3.1 Pro), date: 2026-09-17
-- Scope: Generated INSERT statement based on schema and csv file data
-- Author review: It is a simple creation of an insert statement, AI was used to speed up an otherwise manual process

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    building VARCHAR(255) NOT NULL,
    floor VARCHAR(50), 
    location_description TEXT,
    
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    
    starting_time TIME DEFAULT '00:00:00',
    closing_time TIME DEFAULT '23:59:00',
    image_url TEXT,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Assistance Disclosure: INSERT statement generated with AI
INSERT INTO suppliers (name, type, building, floor, location_description, latitude, longitude, starting_time, closing_time, image_url) VALUES 
('Anna''s x Soup Union', 'Food', 'Central Library', '1', 'Next to NUS Co-op', 1.296444, 103.773032, '09:00:00', '18:00:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ANNA.jpeg'),
('NUS Co-op', 'Shopping', 'Central Library', '1', 'Inside the library on the right side', 1.2967866, 103.7732677, '09:00:00', '16:00:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/NUS_COOP.jpeg'),
('Printer @ Com 2', 'Printing', 'Com 2', '1', 'Next to LT19', 1.2938347, 103.7744572, '00:00:00', '23:59:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/PRINTER_COM2.jpeg'),
('Cool Spot', 'Food', 'Com2', '1', 'Opp LT16', 1.2940156, 103.7738478, '09:00:00', '21:30:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/COOL_SPOT.jpeg'),
('InstaChef', 'Food', 'Terrace', '1', 'Next to foyer', 1.2938898, 103.7736305, '00:00:00', '23:59:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/INSTACHEF.jpeg'),
('Cafe+ Robot Cafe', 'Food/Coffee', 'Central Library', '1', 'Opp to central library entrance', 1.296444, 103.773032, '00:00:00', '23:59:00', 'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ROBOT_CAFE.jpeg'),
('A Hot Hideout', 'Food', 'Prince George''s Park', '2', 'Near PGP entrance', 1.2908445, 103.7770891, '11:00:00', '21:30:00', NULL),
('Arise and Shine', 'Food', 'Engineering Block E4', '4', 'Near LT6', 1.2991517, 103.769064, '08:00:00', '18:00:00', NULL),
('Bakehaus / Aurea', 'Food', 'The Ridge', '1', 'Near COM2', 1.2946778, 103.7707872, '08:00:00', '21:00:00', NULL),
('Central Square @ YIH', 'Food', 'Yusof Ishak House', '1', 'Closest to Opp UHC bus stop', 1.2984401, 103.7726256, '08:00:00', '20:00:00', NULL),
('Pasta Express', 'Food', 'Frontier', '1', 'Aircon section', 1.2947819, 103.7704435, '09:30:00', '19:30:00', NULL),
('TOMORO COFFEE', 'Food/Coffee', 'Hon Sui Sen Memorial Library', '2', 'Inside HSSML', 1.2931259, 103.7719943, '08:15:00', '18:00:00', NULL),
('Octobox', 'Shopping', 'Prince George''s Park', '2', 'Near PGP entrance', 1.2904347, 103.7787588, '00:00:00', '23:59:00', NULL),
('Smooy', 'Food', 'COM3', '1', 'The Terrace @ COM3', 1.2948308, 103.7716305, '11:00:00', '21:00:00', NULL),
('Goh Bros E-Print Pte Ltd', 'Printing', 'Yusof Ishak House', '5', 'Take the long staircase up YIH', 1.2984905, 103.7720544, '09:00:00', '18:00:00', NULL),
('Cheers Unmanned Convenience Store', 'Shopping', 'Engineering Block E3', '4', 'Take right from Arise n Shine', 1.2994341, 103.7526298, '00:00:00', '23:59:00', NULL),
('Nami', 'Food', 'innovation4.0', '1', 'Opp TCOMS', 1.2942982, 103.7708813, '08:00:00', '17:30:00', NULL),
('Supersnacks', 'Food', 'Prince George''s Park', '1', 'At level 1 in Prince George''s Park Residences, Block 10', 1.2913847, 103.7776367, '11:00:00', '02:00:00', NULL),
('Good Day Cafe', 'Food/Coffee', 'Medicine+Science Library', '1', 'Inside MedScience library', 1.2967989, 103.7794336, '07:30:00', '18:30:00', NULL),
('The Coffee Roaster', 'Food/Coffee', 'Blk AS8', '1', 'Behind central library bus stop', 1.296252229, 103.7720926, '08:00:00', '17:30:00', NULL),
('he by He Brews', 'Food/Coffee', 'Engineering Block EA', '1', 'Near LT7 & Engineering Auditorium', 1.300566804, 103.7707577, '08:00:00', '17:00:00', NULL);
