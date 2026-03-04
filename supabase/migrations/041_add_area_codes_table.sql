-- Create area codes table for phone number routing and compliance
CREATE TABLE IF NOT EXISTS area_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(area_code)
);

-- Create index for fast lookups
CREATE INDEX idx_area_codes_code ON area_codes(area_code);
CREATE INDEX idx_area_codes_country ON area_codes(country);

-- Enable RLS
ALTER TABLE area_codes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (readable by all, writable by service role)
CREATE POLICY "Anyone can read area codes"
  ON area_codes
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage area codes"
  ON area_codes
  FOR ALL
  USING (true);

-- Insert Canadian area codes
INSERT INTO area_codes (area_code, country_code, country, region, notes) VALUES
  -- Alberta
  ('403', '1', 'Canada', 'Alberta', 'Calgary, southern Alberta'),
  ('587', '1', 'Canada', 'Alberta', 'Overlay for 403, 780, 825'),
  ('780', '1', 'Canada', 'Alberta', 'Edmonton, northern Alberta'),
  ('825', '1', 'Canada', 'Alberta', 'Overlay for 780'),

  -- British Columbia
  ('236', '1', 'Canada', 'British Columbia', 'Overlay for 604, 778'),
  ('250', '1', 'Canada', 'British Columbia', 'Victoria, most of BC outside Vancouver'),
  ('604', '1', 'Canada', 'British Columbia', 'Vancouver, Lower Mainland'),
  ('672', '1', 'Canada', 'British Columbia', 'Overlay for 604, 778, 236'),
  ('778', '1', 'Canada', 'British Columbia', 'Overlay for 604, 250'),

  -- Manitoba
  ('204', '1', 'Canada', 'Manitoba', 'Entire province'),
  ('431', '1', 'Canada', 'Manitoba', 'Overlay for 204'),

  -- New Brunswick
  ('506', '1', 'Canada', 'New Brunswick', 'Entire province'),

  -- Newfoundland and Labrador
  ('709', '1', 'Canada', 'Newfoundland and Labrador', 'Entire province'),

  -- Northwest Territories, Nunavut, Yukon
  ('867', '1', 'Canada', 'Territories', 'NWT, Nunavut, Yukon'),

  -- Nova Scotia, Prince Edward Island
  ('782', '1', 'Canada', 'Nova Scotia/PEI', 'Overlay for 902'),
  ('902', '1', 'Canada', 'Nova Scotia/PEI', 'Nova Scotia and PEI'),

  -- Ontario
  ('226', '1', 'Canada', 'Ontario', 'Overlay for 519'),
  ('249', '1', 'Canada', 'Ontario', 'Overlay for 705'),
  ('289', '1', 'Canada', 'Ontario', 'Overlay for 905, 365'),
  ('343', '1', 'Canada', 'Ontario', 'Overlay for 613'),
  ('365', '1', 'Canada', 'Ontario', 'Overlay for 905, 289'),
  ('416', '1', 'Canada', 'Ontario', 'Toronto'),
  ('437', '1', 'Canada', 'Ontario', 'Overlay for 416, 647'),
  ('519', '1', 'Canada', 'Ontario', 'Southwest Ontario'),
  ('548', '1', 'Canada', 'Ontario', 'Overlay for 226, 519'),
  ('613', '1', 'Canada', 'Ontario', 'Ottawa, eastern Ontario'),
  ('647', '1', 'Canada', 'Ontario', 'Overlay for 416'),
  ('705', '1', 'Canada', 'Ontario', 'Northern Ontario'),
  ('807', '1', 'Canada', 'Ontario', 'Northwestern Ontario'),
  ('905', '1', 'Canada', 'Ontario', 'Greater Toronto Area'),

  -- Quebec
  ('263', '1', 'Canada', 'Quebec', 'Overlay for 819, 873'),
  ('354', '1', 'Canada', 'Quebec', 'Overlay for 450, 579'),
  ('367', '1', 'Canada', 'Quebec', 'Overlay for 418, 581'),
  ('382', '1', 'Canada', 'Quebec', 'Overlay for 514, 438, 428'),
  ('387', '1', 'Canada', 'Quebec', 'Overlay for 819, 873, 263'),
  ('418', '1', 'Canada', 'Quebec', 'Quebec City, eastern Quebec'),
  ('428', '1', 'Canada', 'Quebec', 'Overlay for 514, 438'),
  ('438', '1', 'Canada', 'Quebec', 'Overlay for 514'),
  ('450', '1', 'Canada', 'Quebec', 'Regions surrounding Montreal'),
  ('468', '1', 'Canada', 'Quebec', 'Overlay for 514, 438, 428, 382'),
  ('474', '1', 'Canada', 'Quebec', 'Overlay for 450, 579, 354'),
  ('514', '1', 'Canada', 'Quebec', 'Montreal'),
  ('579', '1', 'Canada', 'Quebec', 'Overlay for 450'),
  ('581', '1', 'Canada', 'Quebec', 'Overlay for 418'),
  ('819', '1', 'Canada', 'Quebec', 'Western Quebec, Outaouais'),
  ('873', '1', 'Canada', 'Quebec', 'Overlay for 819'),

  -- Saskatchewan
  ('306', '1', 'Canada', 'Saskatchewan', 'Entire province'),
  ('639', '1', 'Canada', 'Saskatchewan', 'Overlay for 306'),
  ('368', '1', 'Canada', 'Saskatchewan', 'Overlay for 306, 639'),

  -- Additional overlays
  ('742', '1', 'Canada', 'Ontario', 'Overlay for 705, 249'),
  ('753', '1', 'Canada', 'Ontario', 'Overlay for 613, 343'),
  ('584', '1', 'Canada', 'Manitoba', 'Overlay for 204, 431'),
  ('879', '1', 'Canada', 'Quebec', 'Overlay for 819, 873, 263, 387')
ON CONFLICT (area_code) DO NOTHING;

-- Add comments
COMMENT ON TABLE area_codes IS 'North American area code registry for SMS routing and compliance';
COMMENT ON COLUMN area_codes.area_code IS 'Three-digit area code';
COMMENT ON COLUMN area_codes.country_code IS 'Country calling code (e.g., 1 for North America)';
COMMENT ON COLUMN area_codes.country IS 'Country name';
COMMENT ON COLUMN area_codes.region IS 'State/province/region';
