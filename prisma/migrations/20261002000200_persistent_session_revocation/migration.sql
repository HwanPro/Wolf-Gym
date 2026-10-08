ALTER TABLE users ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION bump_user_security_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password IS DISTINCT FROM OLD.password
     OR NEW."twoFASecret" IS DISTINCT FROM OLD."twoFASecret"
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    NEW."securityVersion" := OLD."securityVersion" + 1;
  ELSIF NEW."securityVersion" < OLD."securityVersion" THEN
    RAISE EXCEPTION 'securityVersion cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_credentials_revoke_sessions
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION bump_user_security_version();
