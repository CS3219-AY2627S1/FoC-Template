-- Delivery points catalogue + per-user usage; extend order dropoff snapshot.

CREATE TABLE delivery_point (
    id BIGSERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    building TEXT NOT NULL,
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX delivery_point_code_uidx ON delivery_point (code) WHERE code IS NOT NULL;

CREATE TABLE user_delivery_point (
    user_id VARCHAR(320) NOT NULL,
    delivery_point_id BIGINT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, delivery_point_id)
);

CREATE INDEX user_delivery_point_point_idx ON user_delivery_point (delivery_point_id);
CREATE INDEX user_delivery_point_user_usage_idx ON user_delivery_point (user_id, use_count DESC, last_used_at DESC);

ALTER TABLE orders
    ADD COLUMN dropoff_building VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN dropoff_description VARCHAR(500) NOT NULL DEFAULT '';

ALTER TABLE orders
    ALTER COLUMN dropoff_building DROP DEFAULT,
    ALTER COLUMN dropoff_description DROP DEFAULT;

INSERT INTO delivery_point (id, code, name, building, description, latitude, longitude, active) VALUES
(1, 'kent-ridge-mrt', 'Kent Ridge MRT, Exit A', 'Kent Ridge MRT', 'At Exit A, beside NUH', 1.294197, 103.784419, TRUE),
(2, 'kent-ridge-terminal', 'Kent Ridge Bus Terminal', 'Kent Ridge Bus Terminal', 'At the terminal shelter', 1.294245, 103.769680, TRUE),
(3, 'pgp-foyer', 'Prince George''s Park foyer', 'Prince George''s Park Residences', 'At the PGP Foyer bus stop', 1.290956, 103.781066, TRUE),
(4, 'utown-bus-stop', 'UTown bus stop', 'University Town', 'At the UTown bus stop by the Hockey Pitch', 1.303535, 103.774431, TRUE),
(5, 'central-library-bus-stop', 'Central Library bus stop', 'Central Library', 'At the bus stop', 1.296275, 103.772205, TRUE),
(6, 'yih-bus-stop', 'YIH bus stop', 'Yusof Ishak House', 'At the bus stop outside YIH', 1.298863, 103.774321, TRUE),
(7, 'lt27-bus-stop', 'LT27 bus stop', 'Lim Seng Tjoe Lecture Theatre (LT27)', 'At the bus stop', 1.297406, 103.780990, TRUE),
(8, 'central-library', 'Central Library', 'Central Library', 'Main entrance', 1.296621, 103.773076, TRUE),
(9, 'hssml', 'Hon Sui Sen Memorial Library', 'Hon Sui Sen Memorial Library', 'Main entrance', 1.293022, 103.774435, TRUE),
(10, 'medicine-science-library', 'Medicine+Science Library', 'Medicine+Science Library', 'Main entrance', 1.296958, 103.781734, TRUE),
(11, 'com1', 'COM1', 'COM1', 'Ground floor lobby', 1.295016, 103.773909, TRUE),
(12, 'com3', 'COM3', 'COM3', 'Ground floor lobby', 1.294583, 103.774582, TRUE),
(13, 'the-deck', 'The Deck', 'The Deck', 'Canteen entrance', 1.294671, 103.772492, TRUE),
(14, 'as8', 'AS8', 'AS8', 'Ground floor lobby', 1.296040, 103.772285, TRUE),
(15, 'biz1', 'BIZ1', 'Mochtar Riady Building', 'Ground floor lobby', 1.292502, 103.774146, TRUE),
(16, 'e1', 'E1', 'Engineering Block E1', 'Ground floor lobby', 1.298706, 103.771095, TRUE),
(17, 'ea', 'EA', 'Engineering Block EA', 'Near LT7', 1.300249, 103.770694, TRUE),
(18, 'techno-edge', 'Techno Edge', 'Techno Edge', 'Canteen entrance', 1.297955, 103.771530, TRUE),
(19, 'sde1', 'SDE1', 'SDE1', 'Ground floor lobby', 1.297321, 103.770676, TRUE),
(20, 's16', 'S16', 'Science Block S16', 'Ground floor lobby', 1.296776, 103.780401, TRUE),
(21, 'yih', 'Yusof Ishak House', 'Yusof Ishak House', 'Main entrance', 1.298503, 103.774772, TRUE),
(22, 'uhc', 'University Health Centre', 'University Health Centre', 'Main entrance', 1.299070, 103.776427, TRUE),
(23, 'sports-centre', 'University Sports Centre', 'University Sports Centre', 'Main entrance', 1.299711, 103.775458, TRUE),
(24, 'ucc', 'University Cultural Centre', 'University Cultural Centre', 'Main entrance', 1.301759, 103.772293, TRUE),
(25, 'town-plaza', 'UTown Town Plaza', 'Town Plaza', 'At the Town Plaza', 1.303904, 103.773982, TRUE),
(26, 'stephen-riady-centre', 'Stephen Riady Centre', 'Stephen Riady Centre', 'Main entrance', 1.304620, 103.772522, TRUE),
(27, 'erc', 'Education Resource Centre', 'Education Resource Centre', 'Main entrance', 1.305980, 103.772914, TRUE),
(28, 'utown-residence', 'UTown Residence', 'UTown Residence', 'Between the North and South Towers', 1.305129, 103.773873, TRUE),
(29, 'tembusu', 'Tembusu College', 'Tembusu Tower', 'Tower lobby', 1.306209, 103.773699, TRUE),
(30, 'capt', 'College of Alice & Peter Tan', 'College of Alice & Peter Tan', 'Lobby', 1.307599, 103.773148, TRUE),
(31, 'rc4', 'Residential College 4', 'RC4 Tower', 'Tower lobby', 1.308243, 103.773288, TRUE),
(32, 'raffles-hall', 'Raffles Hall', 'Raffles Hall', 'At the Raffles Hall bus stop', 1.300969, 103.772746, TRUE),
(33, 'kent-vale', 'Kent Vale', 'Kent Vale', 'At the Kent Vale bus stop', 1.301833, 103.769613, TRUE),
(34, 'temasek-hall', 'Temasek Hall', 'Temasek Hall', 'Hall entrance', 1.292741, 103.771268, TRUE),
(35, 'eusoff-hall', 'Eusoff Hall', 'Eusoff Hall', 'Hall entrance', 1.293328, 103.770091, TRUE),
(36, 'kent-ridge-hall', 'Kent Ridge Hall', 'Kent Ridge Hall', 'Hall entrance', 1.291541, 103.774618, TRUE),
(37, 'kevii', 'King Edward VII Hall', 'King Edward VII Hall', 'Hall entrance', 1.292961, 103.780575, TRUE),
(38, 'rvrc', 'Ridge View Residential College', 'Ridge View Residential College', 'College entrance', 1.298181, 103.776113, TRUE),
(39, 'sheares-hall', 'Sheares Hall', 'Sheares Hall', 'Hall entrance', 1.291176, 103.775514, TRUE);

SELECT setval(pg_get_serial_sequence('delivery_point', 'id'), (SELECT MAX(id) FROM delivery_point));

