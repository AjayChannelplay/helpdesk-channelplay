-- Check if the assign_user_round_robin function exists
SELECT routine_name 
FROM information_schema.routines
WHERE routine_type = 'FUNCTION' 
  AND routine_name = 'assign_user_round_robin';

-- Check if the desks table has the last_assigned_user_id column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'desks' 
  AND column_name = 'last_assigned_user_id';

-- If the column doesn't exist, this will add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'desks' AND column_name = 'last_assigned_user_id'
  ) THEN
    ALTER TABLE desks ADD COLUMN last_assigned_user_id UUID REFERENCES auth.users(id);
  END IF;
END
$$;
