-- AI Assistance Disclosure (hwangjihun):
-- Tool: ChatGPT (Codex, model: GPT-6), date: 2026-11-10
-- Scope: Added sourced NUS campus supplier development data.
-- Frozen snapshot of the 110 additions in CSV rows 23-132 on 2026-11-10.
-- Sources and field conventions: data/csv/README.md.
-- Generated with scripts/generate_seed.py render_seed(load_suppliers()[21:]).
-- Keep this applied migration unchanged when future seed data is added.
-- Existing normalized identities and their category assignments are preserved.
-- Image URLs are omitted and default to NULL on newly inserted suppliers.
BEGIN;

DO $supplier_seed$
DECLARE
    inserted_supplier_id uuid;
BEGIN
    -- Bistro Box
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Bistro Box', 'College of Design and Engineering', 'Collect at the Bistro Box counter in CDE.', NULL, NULL, NULL, '07:30', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Burnt Cones
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Burnt Cones', 'Medicine Block MD11', 'Collect at the Burnt Cones counter in MD11.', NULL, NULL, NULL, '07:30', '21:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Burnt Cones
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Burnt Cones', 'University Hall', 'Collect at the Burnt Cones counter in University Hall.', NULL, NULL, NULL, '08:00', '19:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Cafe Delight
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Cafe Delight', 'Ventus', 'Collect at the Cafe Delight counter in Ventus.', NULL, NULL, NULL, '08:00', '17:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Chong Pang Tai Zhi Wei
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Chong Pang Tai Zhi Wei', 'The Deck', 'Collect at the Chong Pang Tai Zhi Wei stall on level 2.', '2', NULL, NULL, '07:30', '16:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- CHAGEE
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('CHAGEE', 'Yusof Ishak House', 'Collect at the CHAGEE counter on level 1.', '1', NULL, NULL, '10:30', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Eureka Taste
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Eureka Taste', 'Medicine Block MD6', 'Collect at the Eureka Taste counter in MD6.', NULL, NULL, NULL, '07:00', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Fong Seng Nasi Lemak
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Fong Seng Nasi Lemak', 'The Deck', 'Collect at the Fong Seng Nasi Lemak stall on level 2.', '2', NULL, NULL, '08:00', '17:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Frontier
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Frontier', 'Faculty of Science', 'Meet at the Frontier canteen entrance and confirm the stall with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Li Ji Coffeehouse
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Li Ji Coffeehouse', 'Frontier', 'Collect at Li Ji Coffeehouse in the air-conditioned section.', NULL, NULL, NULL, '07:00', '19:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Liang Ban Kung Fu
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Liang Ban Kung Fu', 'The Deck', 'Collect at the Liang Ban Kung Fu stall on level 2.', '2', NULL, NULL, '08:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Makan Boleh
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Makan Boleh', 'COM3', 'Collect at Makan Boleh in The Terrace at COM3.', NULL, NULL, NULL, '08:00', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Mini Wok & Dim Sum
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Mini Wok & Dim Sum', 'Yusof Ishak House', 'Collect at the Mini Wok & Dim Sum counter on level 1.', '1', NULL, NULL, '10:00', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Mixue
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Mixue', 'Frontier', 'Collect at the Mixue counter at Frontier.', NULL, NULL, NULL, '10:00', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Nine Fresh
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Nine Fresh', 'Faculty of Science', 'Collect at the Nine Fresh counter in the Faculty of Science.', NULL, NULL, NULL, '11:00', '18:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Potato Corner
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Potato Corner', 'Yusof Ishak House', 'Collect at the Potato Corner counter in YIH.', NULL, NULL, NULL, '11:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- PGP Aircon Canteen
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('PGP Aircon Canteen', 'Prince George''s Park', 'Meet at the air-conditioned canteen entrance and confirm the stall with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- QQ Rice
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('QQ Rice', 'Science Block S16', 'Collect at the QQ Rice counter in S16.', NULL, NULL, NULL, '07:30', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Sloppy B
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Sloppy B', 'University Sports Centre', 'Collect at the Sloppy B counter; confirm collection time for Friday orders.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- South & East
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('South & East', 'Shaw Foundation Alumni House', 'Collect at South & East, units 01-01 to 01-03; confirm the lunch or dinner collection window.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Poonsti Cafe
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Poonsti Cafe', 'Shaw Foundation Alumni House', 'Collect at Poonsti Cafe; food service ends before drinks service.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Starbucks
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Starbucks', 'Science Block S9', 'Collect at the Starbucks counter in S9.', NULL, NULL, NULL, '07:30', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Starbucks
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Starbucks', 'College of Design and Engineering', 'Collect at the Starbucks counter in CDE.', NULL, NULL, NULL, '08:00', '16:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Taiwan Ichiban
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Taiwan Ichiban', 'Frontier', 'Collect at Taiwan Ichiban in the air-conditioned section.', NULL, NULL, NULL, '08:30', '19:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Techno Edge
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Techno Edge', 'College of Design and Engineering', 'Meet at the Techno Edge canteen entrance and confirm the stall with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- TempuRamen
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('TempuRamen', 'Yusof Ishak House', 'Collect at the TempuRamen counter on level 1.', '1', NULL, NULL, '09:30', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- The Acai Truck
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Acai Truck', 'Prince George''s Park', 'Collect at The Acai Truck in the PGP canteen; confirm Friday collection hours.', '2', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- The Coffee Bean and Tea Leaf
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Coffee Bean and Tea Leaf', 'COM3', 'Collect at The Coffee Bean and Tea Leaf in The Terrace at COM3.', NULL, NULL, NULL, '09:00', '18:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- The Deck
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Deck', 'Faculty of Arts and Social Sciences', 'Meet at The Deck canteen entrance and confirm the stall with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- The Spread
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Spread', 'Mochtar Riady Building', 'Collect at The Spread counter in the Business School.', NULL, NULL, NULL, '08:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- The Terrace
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Terrace', 'COM3', 'Meet at The Terrace canteen entrance and confirm the stall with the requester.', NULL, NULL, NULL, '07:30', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Uncle Penyet Fusion
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Uncle Penyet Fusion', 'Frontier', 'Collect at Uncle Penyet Fusion in the air-conditioned section.', NULL, NULL, NULL, '07:00', '19:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Wild Skew
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Wild Skew', 'Yusof Ishak House', 'Collect at the Wild Skew counter on level 2.', '2', NULL, NULL, '11:30', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Wok Express
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Wok Express', 'Yusof Ishak House', 'Collect at the Wok Express counter on level 1.', '1', NULL, NULL, '10:00', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Wonderful Cafe
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Wonderful Cafe', 'College of Design and Engineering', 'Collect at the Wonderful Cafe counter in CDE.', NULL, NULL, NULL, '07:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Wonderful Cafe
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Wonderful Cafe', 'Science Block S16', 'Collect at the Wonderful Cafe counter in S16.', NULL, NULL, NULL, '07:30', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Bismillah Biryani
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Bismillah Biryani', 'Stephen Riady Centre', 'Collect at the Bismillah Biryani counter in UTown.', NULL, NULL, NULL, '11:30', '19:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Fine Food
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Fine Food', 'Town Plaza', 'Meet at the Fine Food food court entrance and confirm the stall with the requester.', NULL, NULL, NULL, '08:00', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Flavours @ UTown
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Flavours @ UTown', 'Stephen Riady Centre', 'Meet at the Flavours food court entrance and confirm the stall with the requester.', NULL, NULL, NULL, '07:30', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Hwang's Korean Restaurant
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Hwang''s Korean Restaurant', 'Town Plaza', 'Collect at Hwang''s Korean Restaurant in UTown.', NULL, NULL, NULL, '10:30', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Jollibee
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Jollibee', 'Town Plaza', 'Collect at the Jollibee counter in UTown.', NULL, NULL, NULL, '09:00', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Mr Bean / Do Qoo
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Mr Bean / Do Qoo', 'Town Plaza', 'Collect at the Mr Bean / Do Qoo counter in UTown.', NULL, NULL, NULL, '07:30', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Makan Malah!
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Makan Malah!', 'Town Plaza', 'Collect at the Makan Malah! counter in UTown.', NULL, NULL, NULL, '11:00', '22:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Starbucks
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Starbucks', 'Education Resource Centre', 'Collect at Starbucks in ERC; check term-time or vacation hours before ordering.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Subway
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Subway', 'Stephen Riady Centre', 'Collect at the Subway counter in UTown.', NULL, NULL, NULL, '08:30', '21:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Supersnacks
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Supersnacks', 'Stephen Riady Centre', 'Collect at Supersnacks in UTown; weekend service starts later.', NULL, NULL, NULL, '11:00', '02:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- The Royals Bistro
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('The Royals Bistro', 'Town Plaza', 'Collect at The Royals Bistro counter in UTown.', NULL, NULL, NULL, '11:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Sapore
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Sapore', 'Stephen Riady Centre', 'Collect at the Sapore counter in UTown.', NULL, NULL, NULL, '11:30', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- TOMORO COFFEE
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('TOMORO COFFEE', 'NUS College', 'Collect at the TOMORO COFFEE counter at NUS College.', NULL, NULL, NULL, '08:00', '18:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD'), (inserted_supplier_id, 'COFFEE');
    END IF;

    -- Triplets
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Triplets', 'Stephen Riady Centre', 'Collect at the Triplets waffle counter in UTown.', NULL, NULL, NULL, '09:00', '21:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Udon Don Bar
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Udon Don Bar', 'Town Plaza', 'Collect at the Udon Don Bar counter in UTown.', NULL, NULL, NULL, '11:00', '21:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Waa Cow / Bueno Bueno
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Waa Cow / Bueno Bueno', 'Stephen Riady Centre', 'Collect at the Waa Cow / Bueno Bueno counter in UTown.', NULL, NULL, NULL, '11:30', '20:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- BTC Cafeteria
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('BTC Cafeteria', 'Bukit Timah Campus Block B', 'Meet at the Block B cafeteria entrance and confirm the stall with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'FOOD');
    END IF;

    -- Cheers Unmanned Convenience Store
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Cheers Unmanned Convenience Store', 'Yusof Ishak House', 'Collect outside the Cheers store on level 1.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- FairPricexpress
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('FairPricexpress', 'Kent Vale', 'Collect outside FairPricexpress at Kent Vale.', NULL, NULL, NULL, '07:00', '23:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- FairPricexpress
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('FairPricexpress', 'Stephen Riady Centre', 'Collect outside FairPricexpress in UTown; check vacation hours.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- OCBC @ NUS
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('OCBC @ NUS', 'Stephen Riady Centre', 'Meet outside the OCBC branch in UTown; banking services require the account holder.', NULL, NULL, NULL, '11:00', '19:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'OTHERS');
    END IF;

    -- NUS Co-op
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('NUS Co-op', 'Science LT27', 'Collect at the NUS Co-op counter at Science LT27.', NULL, NULL, NULL, '10:00', '17:30')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- Octobox
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Octobox', 'Stephen Riady Centre', 'Collect outside the Octobox store in UTown.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- Skosk Beautique
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Skosk Beautique', 'Stephen Riady Centre', 'Meet outside Skosk Beautique; arrange appointments directly with the outlet.', NULL, NULL, NULL, '10:00', '20:00')
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'SHOPPING');
    END IF;

    -- Printer @ C J Koh Law Library Reading Room
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ C J Koh Law Library Reading Room', 'C J Koh Law Library', 'Use the self-service printers in the level 1 reading room; library access rules apply.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ C J Koh Law Library Copier Room
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ C J Koh Law Library Copier Room', 'C J Koh Law Library', 'Use the self-service printers in the level 2 copier room; library access rules apply.', '2', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Central Library Level 4
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Central Library Level 4', 'Central Library', 'Use the level 4 self-service printers; library access rules apply.', '4', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Central Library Mainshelf Area
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Central Library Mainshelf Area', 'Central Library', 'Use the printers in the level 5 mainshelf area; library access rules apply.', '5', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Hon Sui Sen Memorial Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Hon Sui Sen Memorial Library', 'Hon Sui Sen Memorial Library', 'Use the self-service printers in the level 1 book collection area.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Medicine+Science Library Level 2
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Medicine+Science Library Level 2', 'Medicine+Science Library', 'Use the printers in the level 2 book collection area; library access rules apply.', '2', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Medicine+Science Library Level 3
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Medicine+Science Library Level 3', 'Medicine+Science Library', 'Use the level 3 self-service printers; library access rules apply.', '3', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ AS8 Computer Room Level 2
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ AS8 Computer Room Level 2', 'Blk AS8', 'Use the printers in computer room AS8-02-01; campus access rules apply.', '2', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ AS8 Computer Room Level 1
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ AS8 Computer Room Level 1', 'Blk AS8', 'Enter computer room AS8-01-02 from The Coffee Roaster; campus access rules apply.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ PGPR Block 8
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ PGPR Block 8', 'Prince George''s Park Block 8', 'Use the black-and-white self-service printers at basement 1; residence access rules apply.', 'B1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Printer @ Raffles Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Printer @ Raffles Hall', 'Raffles Hall', 'Confirm access with a resident before using the hall self-service printers.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'PRINTING');
    END IF;

    -- Central Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Central Library', 'Central Library', 'Meet outside the library entrance; entry to library spaces requires eligibility.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- C J Koh Law Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('C J Koh Law Library', 'C J Koh Law Library', 'Meet outside the law library entrance at Bukit Timah Campus.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Hon Sui Sen Memorial Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Hon Sui Sen Memorial Library', 'Hon Sui Sen Memorial Library', 'Meet outside the library entrance; entry to library spaces requires eligibility.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Library@BTC
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Library@BTC', 'Library@BTC', 'Meet outside Library@BTC; confirm the entrance with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Medicine+Science Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Medicine+Science Library', 'Medicine+Science Library', 'Meet outside the library entrance; entry to library spaces requires eligibility.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Music Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Music Library', 'Music Library', 'Meet outside the Music Library entrance; entry to library spaces requires eligibility.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Wan Boo Sow Chinese Library
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Wan Boo Sow Chinese Library', 'Wan Boo Sow Chinese Library', 'Meet outside the Chinese Library entrance; entry to library spaces requires eligibility.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Eusoff Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Eusoff Hall', 'Eusoff Hall', 'Meet outside the main entrance of Eusoff Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Kent Ridge Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Kent Ridge Hall', 'Kent Ridge Hall', 'Meet outside the main entrance of Kent Ridge Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- King Edward VII Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('King Edward VII Hall', 'King Edward VII Hall', 'Meet outside the main entrance of King Edward VII Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Raffles Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Raffles Hall', 'Raffles Hall', 'Meet outside the main entrance of Raffles Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Sheares Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Sheares Hall', 'Sheares Hall', 'Meet outside the main entrance of Sheares Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Temasek Hall
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Temasek Hall', 'Temasek Hall', 'Meet outside the main entrance of Temasek Hall; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Helix House
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Helix House', 'Helix House', 'Meet outside the main entrance of Helix House; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- LightHouse
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('LightHouse', 'LightHouse', 'Meet outside the main entrance of LightHouse; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Pioneer House
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Pioneer House', 'Pioneer House', 'Meet outside the main entrance of Pioneer House; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Valour House
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Valour House', 'Valour House', 'Meet outside the main entrance of Valour House; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Acacia College
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Acacia College', 'Acacia College', 'Meet outside the main entrance of Acacia College; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- College of Alice & Peter Tan
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('College of Alice & Peter Tan', 'College of Alice & Peter Tan', 'Meet outside the main entrance of College of Alice & Peter Tan; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Residential College 4
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Residential College 4', 'Residential College 4', 'Meet outside the main entrance of Residential College 4; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Tembusu College
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Tembusu College', 'Tembusu College', 'Meet outside the main entrance of Tembusu College; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Ridge View Residential College
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Ridge View Residential College', 'Ridge View Residential College', 'Meet outside the college entrance; arrange handover with the resident.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- NUS College
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('NUS College', 'NUS College', 'Confirm the residence entrance with the requester and meet outside the access gates.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- UTown Residence
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('UTown Residence', 'UTown Residence', 'Meet outside the residence entrance; confirm the tower with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Prince George's Park Residence
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Prince George''s Park Residence', 'Prince George''s Park', 'Meet at the residence main foyer; confirm the block with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Swimming Pool @ Stephen Riady Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Swimming Pool @ Stephen Riady Centre', 'Stephen Riady Centre', 'Meet outside the swimming pool entrance; entry and booking rules apply.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Swimming Pool @ University Sports Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Swimming Pool @ University Sports Centre', 'University Sports Centre', 'Meet outside the swimming pool entrance; entry and booking rules apply.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Fitness Gym @ Stephen Riady Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Fitness Gym @ Stephen Riady Centre', 'Stephen Riady Centre', 'Meet outside the gym entrance; entry and booking rules apply.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Fitness Gym @ University Sports Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Fitness Gym @ University Sports Centre', 'University Sports Centre', 'Meet outside the gym entrance; entry and booking rules apply.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Badminton Courts @ MPSH 5
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Badminton Courts @ MPSH 5', 'MPSH 5', 'Meet outside MPSH 5; confirm the badminton court with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- UTown Sports Hall 1
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('UTown Sports Hall 1', 'Stephen Riady Centre', 'Meet outside Sports Hall 1; entry and booking rules apply.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Squash Courts @ University Sports Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Squash Courts @ University Sports Centre', 'University Sports Centre', 'Meet outside the squash courts; confirm the court with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Table Tennis @ MPSH 1
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Table Tennis @ MPSH 1', 'MPSH 1', 'Meet outside MPSH 1; confirm the table with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Kent Ridge Outdoor Tennis Courts
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Kent Ridge Outdoor Tennis Courts', 'Kent Ridge Outdoor Courts', 'Meet outside the outdoor tennis courts; confirm the court with the requester.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- NUS Museum
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('NUS Museum', 'University Cultural Centre', 'Meet outside the museum entrance at University Cultural Centre.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- University Cultural Centre
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('University Cultural Centre', 'University Cultural Centre', 'Meet outside the main entrance at 50 Kent Ridge Crescent.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- Lee Kong Chian Natural History Museum
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Lee Kong Chian Natural History Museum', 'Lee Kong Chian Natural History Museum', 'Meet outside the museum at 2 Conservatory Drive; gallery admission is separate.', NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'LANDMARK');
    END IF;

    -- PC Commons
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('PC Commons', 'Education Resource Centre', 'Meet outside PC Commons on level 1; NUS staff or student card required for entry.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'OTHERS');
    END IF;

    -- Mac Commons
    INSERT INTO supplier_service.suppliers (name, building_area, pickup_location_description, floor, latitude, longitude, opening_time, closing_time)
    VALUES ('Mac Commons', 'Education Resource Centre', 'Meet outside Mac Commons on level 1; NUS staff or student card required for entry.', '1', NULL, NULL, NULL, NULL)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_supplier_id;
    IF inserted_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_service.supplier_categories (supplier_id, category_code)
        VALUES (inserted_supplier_id, 'OTHERS');
    END IF;

END;
$supplier_seed$;

COMMIT;
