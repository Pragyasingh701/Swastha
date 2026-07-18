-- See docs/design_document.md section 5 for full rationale.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE families (
  id SERIAL PRIMARY KEY,
  primary_account_phone TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  family_id INT REFERENCES families(id),
  name TEXT,
  dob DATE,
  relation TEXT,
  abha_id TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  profile_id INT REFERENCES profiles(id),
  source TEXT CHECK (source IN ('whatsapp','web_upload')),
  raw_file_url TEXT,
  ocr_text TEXT,
  uploaded_at TIMESTAMP DEFAULT now(),
  status TEXT
);

CREATE TABLE records (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES documents(id),
  profile_id INT REFERENCES profiles(id),
  record_type TEXT CHECK (record_type IN ('diagnosis','medication','lab_result','note')),
  structured_json JSONB,
  record_date DATE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE lab_values (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES records(id),
  profile_id INT REFERENCES profiles(id),
  test_name TEXT,
  value NUMERIC,
  unit TEXT,
  test_date DATE
);

CREATE TABLE medications (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES records(id),
  profile_id INT REFERENCES profiles(id),
  drug_name_raw TEXT,
  drug_name_normalized TEXT,
  dosage TEXT,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true
);

CREATE TABLE drug_interactions_ref (
  id SERIAL PRIMARY KEY,
  drug_a TEXT,
  drug_b TEXT,
  severity TEXT,
  description TEXT
);

CREATE TABLE record_embeddings (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES records(id),
  profile_id INT REFERENCES profiles(id),
  chunk_text TEXT,
  embedding VECTOR(1536)
);

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  profile_id INT REFERENCES profiles(id),
  type TEXT CHECK (type IN ('interaction','duplicate')),
  message TEXT,
  source_record_ids INT[],
  created_at TIMESTAMP DEFAULT now(),
  resolved BOOLEAN DEFAULT false
);
