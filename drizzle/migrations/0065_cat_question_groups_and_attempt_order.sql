alter table public.cat_questions
  add column if not exists shared_group text,
  add column if not exists shared_prompt text,
  add column if not exists group_position integer;

alter table public.cat_questions
  add constraint cat_questions_shared_group_fields_check
  check (
    (shared_group is null and shared_prompt is null and group_position is null)
    or (
      shared_group is not null
      and shared_prompt is not null
      and group_position is not null
      and length(trim(shared_group)) between 1 and 120
      and length(trim(shared_prompt)) between 1 and 4000
      and group_position between 1 and 100
    )
  );

create unique index if not exists cat_questions_group_position_unique
  on public.cat_questions(assessment_id, shared_group, group_position)
  where shared_group is not null;

create table public.cat_attempt_question_orders (
  attempt_id uuid not null references public.cat_attempts(id) on delete cascade,
  question_id uuid not null references public.cat_questions(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (attempt_id, question_id),
  unique (attempt_id, position)
);

alter table public.cat_attempt_question_orders enable row level security;
revoke all on public.cat_attempt_question_orders from public, anon, authenticated;
grant all on public.cat_attempt_question_orders to service_role;

create or replace function public.apply_cat_question_groups(
  _assessment_id uuid,
  _questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _questions is null or jsonb_typeof(_questions) is distinct from 'array' then
    raise exception 'Question group details are invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_questions) as item(question)
    where (
      nullif(btrim(item.question->>'shared_group'), '') is not null
      or nullif(btrim(item.question->>'shared_prompt'), '') is not null
    )
    and (
      nullif(btrim(item.question->>'shared_group'), '') is null
      or length(btrim(item.question->>'shared_group')) > 120
      or nullif(btrim(item.question->>'shared_prompt'), '') is null
      or length(btrim(item.question->>'shared_prompt')) > 4000
      or coalesce(item.question->>'group_position', '') !~ '^([1-9][0-9]?|100)$'
    )
  ) then
    raise exception 'Each shared question needs a group name, shared instructions, and a step number from 1 to 100.';
  end if;

  if exists (
    select btrim(item.question->>'shared_group') as group_name
    from jsonb_array_elements(_questions) as item(question)
    where nullif(btrim(item.question->>'shared_group'), '') is not null
    group by btrim(item.question->>'shared_group')
    having count(*) < 2
      or count(distinct btrim(item.question->>'shared_prompt')) <> 1
      or count(distinct (item.question->>'group_position')::integer) <> count(*)
  ) then
    raise exception 'Shared question groups need at least two questions, identical instructions, and unique step numbers.';
  end if;

  update public.cat_questions question
  set shared_group = nullif(btrim(item.question->>'shared_group'), ''),
      shared_prompt = case
        when nullif(btrim(item.question->>'shared_group'), '') is null then null
        else nullif(btrim(item.question->>'shared_prompt'), '')
      end,
      group_position = case
        when nullif(btrim(item.question->>'shared_group'), '') is null then null
        else (item.question->>'group_position')::integer
      end
  from jsonb_array_elements(_questions) with ordinality as item(question, position)
  where question.assessment_id = _assessment_id
    and question.position = item.position::integer;
end;
$$;

revoke all on function public.apply_cat_question_groups(uuid, jsonb) from public, anon, authenticated;

create or replace function public.create_targeted_cat_assessment_with_groups(
  _course_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb,
  _name text,
  _level_ids uuid[],
  _download_file_path text,
  _download_file_name text,
  _unit_id uuid,
  _student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_id uuid;
begin
  assessment_id := public.create_targeted_cat_assessment(
    _course_id, _title, _instructions, _duration_minutes, _opens_at, _closes_at,
    _questions, _name, _level_ids, _download_file_path, _download_file_name,
    _unit_id, _student_ids
  );
  perform public.apply_cat_question_groups(assessment_id, _questions);
  return assessment_id;
end;
$$;

revoke all on function public.create_targeted_cat_assessment_with_groups(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) from public, anon;
grant execute on function public.create_targeted_cat_assessment_with_groups(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) to authenticated;

create or replace function public.create_facilitator_cat_with_groups(
  _unit_id uuid,
  _title text,
  _name text,
  _level_ids uuid[],
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb,
  _download_file_path text,
  _download_file_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_id uuid;
begin
  assessment_id := public.create_facilitator_cat(
    _unit_id, _title, _name, _level_ids, _instructions, _duration_minutes,
    _opens_at, _closes_at, _questions, _download_file_path, _download_file_name
  );
  perform public.apply_cat_question_groups(assessment_id, _questions);
  return assessment_id;
end;
$$;

revoke all on function public.create_facilitator_cat_with_groups(
  uuid, text, text, uuid[], text, integer, timestamptz, timestamptz, jsonb, text, text
) from public, anon;
grant execute on function public.create_facilitator_cat_with_groups(
  uuid, text, text, uuid[], text, integer, timestamptz, timestamptz, jsonb, text, text
) to authenticated;

create or replace function public.update_cat_assessment_with_groups(
  _assessment_id uuid,
  _title text,
  _name text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _download_file_path text,
  _download_file_name text,
  _questions jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.update_cat_assessment(
    _assessment_id, _title, _name, _instructions, _duration_minutes,
    _opens_at, _closes_at, _download_file_path, _download_file_name, _questions
  );
  if _questions is not null then
    perform public.apply_cat_question_groups(_assessment_id, _questions);
  end if;
end;
$$;

revoke all on function public.update_cat_assessment_with_groups(
  uuid, text, text, text, integer, timestamptz, timestamptz, text, text, jsonb
) from public, anon;
grant execute on function public.update_cat_assessment_with_groups(
  uuid, text, text, text, integer, timestamptz, timestamptz, text, text, jsonb
) to authenticated;

create or replace function public.list_cat_assessments_with_groups()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cat_list jsonb;
  cat_item jsonb;
  question_list jsonb;
  result jsonb := '[]'::jsonb;
begin
  cat_list := public.list_cat_assessments();
  for cat_item in select value from jsonb_array_elements(cat_list)
  loop
    select coalesce(jsonb_agg(
      original.question || jsonb_build_object(
        'shared_group', question.shared_group,
        'shared_prompt', question.shared_prompt,
        'group_position', question.group_position
      ) order by question.position
    ), '[]'::jsonb)
    into question_list
    from public.cat_questions question
    join jsonb_array_elements(cat_item->'questions') as original(question)
      on original.question->>'id' = question.id::text
    where question.assessment_id = (cat_item->>'id')::uuid;

    result := result || jsonb_build_array(
      jsonb_set(cat_item, '{questions}', question_list, true)
    );
  end loop;
  return result;
end;
$$;

revoke all on function public.list_cat_assessments_with_groups() from public, anon;
grant execute on function public.list_cat_assessments_with_groups() to authenticated;

create or replace function public.start_cat_attempt_with_order(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_payload jsonb;
  current_attempt_id uuid;
  question_list jsonb;
begin
  attempt_payload := public.start_cat_attempt(_assessment_id);
  if attempt_payload->>'submitted_at' is not null
    or jsonb_array_length(coalesce(attempt_payload->'questions', '[]'::jsonb)) = 0 then
    return attempt_payload;
  end if;

  current_attempt_id := (attempt_payload->>'id')::uuid;
  perform 1 from public.cat_attempts where id = current_attempt_id for update;

  if not exists (
    select 1
    from public.cat_attempt_question_orders existing_order
    where existing_order.attempt_id = current_attempt_id
  ) then
    insert into public.cat_attempt_question_orders(attempt_id, question_id, position)
    select current_attempt_id, ordered.id, ordered.position
    from (
      with group_order as materialized (
        select shared_group, random() as shuffle_key
        from public.cat_questions
        where assessment_id = _assessment_id
          and shared_group is not null
        group by shared_group
      )
      select
        question.id,
        row_number() over (
          order by
            case when question.shared_group is null then 1 else 0 end,
            group_order.shuffle_key,
            case when question.shared_group is null then null else question.group_position end,
            case when question.shared_group is null then random() else null end,
            question.position
        )::integer as position
      from public.cat_questions question
      left join group_order on group_order.shared_group = question.shared_group
      where question.assessment_id = _assessment_id
    ) ordered
    on conflict (attempt_id, question_id) do nothing;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', question.id,
    'prompt', question.prompt,
    'options', (
      select jsonb_agg(jsonb_build_object(
        'key', option_order.display_option,
        'text', case option_order.source_option
          when 'A' then question.option_a
          when 'B' then question.option_b
          when 'C' then question.option_c
          else question.option_d
        end
      ) order by option_order.display_option)
      from public.cat_attempt_option_orders option_order
      where option_order.attempt_id = current_attempt_id
        and option_order.question_id = question.id
    ),
    'points', question.points,
    'selected_option', (
      select option_order.display_option
      from public.cat_attempt_option_orders option_order
      where option_order.attempt_id = current_attempt_id
        and option_order.question_id = question.id
        and option_order.source_option = answer.selected_option
    ),
    'shared_group', question.shared_group,
    'shared_prompt', question.shared_prompt,
    'group_position', question.group_position
  ) order by question_order.position), '[]'::jsonb)
  into question_list
  from public.cat_attempt_question_orders question_order
  join public.cat_questions question on question.id = question_order.question_id
  left join public.cat_answers answer
    on answer.question_id = question.id and answer.attempt_id = current_attempt_id
  where question_order.attempt_id = current_attempt_id;

  return jsonb_set(attempt_payload, '{questions}', question_list, true);
end;
$$;

revoke all on function public.start_cat_attempt_with_order(uuid) from public, anon;
grant execute on function public.start_cat_attempt_with_order(uuid) to authenticated;
