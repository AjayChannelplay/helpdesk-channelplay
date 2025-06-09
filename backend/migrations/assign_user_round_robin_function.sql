-- Function to assign a user to a message/ticket using round-robin
CREATE OR REPLACE FUNCTION public.assign_user_round_robin(desk_id_param UUID)
RETURNS UUID AS $$
DECLARE
    next_user_id UUID;
    desk_record RECORD;
    assigned_agents RECORD[];
    agent_count INTEGER;
    current_idx INTEGER;
    next_idx INTEGER;
BEGIN
    -- Get the desk record to find the last assigned user
    SELECT * INTO desk_record FROM desks
    WHERE id = desk_id_param;
    
    -- Get all users assigned to this desk
    SELECT array_agg(du) INTO assigned_agents
    FROM desk_users du
    WHERE du.desk_id = desk_id_param
    ORDER BY du.user_id;
    
    -- Count the number of agents
    SELECT array_length(assigned_agents, 1) INTO agent_count;
    
    -- If no agents are assigned to the desk, return NULL
    IF agent_count IS NULL OR agent_count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Find the index of the last assigned user
    IF desk_record.last_assigned_user_id IS NULL THEN
        -- If no user was previously assigned, start with the first user
        next_idx := 0;
    ELSE
        -- Find the current index
        SELECT idx INTO current_idx
        FROM (
            SELECT (a).user_id, row_number() OVER () - 1 as idx
            FROM (SELECT unnest(assigned_agents) a) sq
        ) subq
        WHERE user_id = desk_record.last_assigned_user_id;
        
        -- Calculate the next index using modulo to wrap around
        IF current_idx IS NULL THEN
            next_idx := 0;
        ELSE
            next_idx := (current_idx + 1) % agent_count;
        END IF;
    END IF;
    
    -- Get the next user ID
    SELECT (a).user_id INTO next_user_id
    FROM (
        SELECT unnest(assigned_agents) a, row_number() OVER () - 1 as idx
        FROM (SELECT unnest(assigned_agents) a) sq
    ) subq
    WHERE idx = next_idx;
    
    -- Update the desk with the new last_assigned_user_id
    UPDATE desks
    SET last_assigned_user_id = next_user_id
    WHERE id = desk_id_param;
    
    RETURN next_user_id;
END;
$$ LANGUAGE plpgsql;
