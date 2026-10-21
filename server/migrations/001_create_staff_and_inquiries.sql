CREATE TABLE staff_users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name varchar(120) NOT NULL CHECK (length(btrim(full_name)) > 0),
  email varchar(254) NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_users_email_not_empty CHECK (length(btrim(email)) > 0)
);

CREATE UNIQUE INDEX staff_users_email_lower_idx ON staff_users (lower(email));

CREATE TABLE inquiries (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_name varchar(160) NOT NULL CHECK (length(btrim(customer_name)) > 0),
  contact_method varchar(254) NOT NULL CHECK (length(btrim(contact_method)) > 0),
  subject varchar(200) NOT NULL CHECK (length(btrim(subject)) > 0),
  description varchar(5000) NOT NULL CHECK (length(btrim(description)) > 0),
  status varchar(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved')),
  created_by integer NOT NULL REFERENCES staff_users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inquiries_status_created_at_idx ON inquiries (status, created_at DESC);
CREATE INDEX inquiries_created_by_idx ON inquiries (created_by);
