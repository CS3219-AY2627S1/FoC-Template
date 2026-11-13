UPDATE users
SET faculty = CASE
    WHEN lower(btrim(faculty)) IN ('faculty of arts and social sciences', 'arts & social sciences', 'faculty of arts & social sciences', 'fass') THEN 'Faculty of Arts and Social Sciences'
    WHEN lower(btrim(faculty)) IN ('school of business', 'business', 'nus business school') THEN 'School of Business'
    WHEN lower(btrim(faculty)) IN ('school of computing', 'computing') THEN 'School of Computing'
    WHEN lower(btrim(faculty)) IN ('school of continuing and lifelong education', 'continuing and lifelong education', 'school of continuing & lifelong education') THEN 'School of Continuing and Lifelong Education'
    WHEN lower(btrim(faculty)) IN ('faculty of dentistry', 'dentistry') THEN 'Faculty of Dentistry'
    WHEN lower(btrim(faculty)) IN ('college of design and engineering', 'design & engineering', 'design and engineering', 'college of design & engineering') THEN 'College of Design and Engineering'
    WHEN lower(btrim(faculty)) IN ('duke-nus medical school', 'duke-nus') THEN 'Duke-NUS Medical School'
    WHEN lower(btrim(faculty)) IN ('faculty of law', 'law') THEN 'Faculty of Law'
    WHEN lower(btrim(faculty)) IN ('yong loo lin school of medicine', 'medicine', 'yong loo lin school of medicine (including nursing)') THEN 'Yong Loo Lin School of Medicine'
    WHEN lower(btrim(faculty)) IN ('yong siew toh conservatory of music', 'music') THEN 'Yong Siew Toh Conservatory of Music'
    WHEN lower(btrim(faculty)) IN ('nus college') THEN 'NUS College'
    WHEN lower(btrim(faculty)) IN ('nus graduate school') THEN 'NUS Graduate School'
    WHEN lower(btrim(faculty)) IN ('saw swee hock school of public health', 'public health') THEN 'Saw Swee Hock School of Public Health'
    WHEN lower(btrim(faculty)) IN ('lee kuan yew school of public policy', 'public policy') THEN 'Lee Kuan Yew School of Public Policy'
    WHEN lower(btrim(faculty)) IN ('faculty of science', 'science') THEN 'Faculty of Science'
END
WHERE faculty IS NOT NULL;
