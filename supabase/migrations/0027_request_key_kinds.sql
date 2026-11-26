-- 0027_request_key_kinds.sql
-- Adds the visualizer-to-project request kind used by "Add to Construction Project".
alter table guest_request_keys drop constraint if exists guest_request_keys_kind_check;
alter table guest_request_keys add constraint guest_request_keys_kind_check
  check (kind in ('visualizer_cart','visualizer_project','planner_cart','planner_quotation'));
