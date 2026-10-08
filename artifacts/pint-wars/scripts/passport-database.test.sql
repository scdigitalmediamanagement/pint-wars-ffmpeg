\set QUIET 1
create function public.passport_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end;
$$;
create function public.passport_expect_failure(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected failure: %', expected;
end;
$$;
select public.passport_assert(
  (select bool_and(definition = pg_get_functiondef(signature::regprocedure)) from public.passport_test_war_definitions),
  'War logging, scored reviews, deletion and War activity guards are unchanged');
insert into auth.users(id, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111', '{"display_name":"Passport visitor"}'),
 ('22222222-2222-4222-8222-222222222222', '{"display_name":"Community reader"}');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set request.jwt.claim.role = 'authenticated';
set role authenticated;
insert into storage.objects(bucket_id,name) values
 ('pint-proofs','11111111-1111-4111-8111-111111111111/passport/first.jpg'),
 ('pint-proofs','11111111-1111-4111-8111-111111111111/passport/repeat.jpg');
select public.passport_expect_failure(
  $$select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,null)$$,
  'Exactly one Passport photo is required');
select public.passport_expect_failure(
  $$select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,'11111111-1111-4111-8111-111111111111/passport/missing.jpg')$$,
  'Passport photo was not found');
select public.passport_expect_failure(
  $$select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,'22222222-2222-4222-8222-222222222222/passport/stolen.jpg')$$,
  'Exactly one Passport photo is required');
select public.passport_expect_failure(
  $$select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,'11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999/proof.jpg')$$,
  'Exactly one Passport photo is required');
select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,
 '11111111-1111-4111-8111-111111111111/passport/first.jpg');
select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,
 '11111111-1111-4111-8111-111111111111/passport/repeat.jpg');
select * from public.log_passport_visit('google_places','pub-one','First Pub','London',51.5,-0.1,
 '11111111-1111-4111-8111-111111111111/passport/repeat.jpg');
select public.passport_assert((select count(*) = 2 from public.pub_visits), 'repeat visits saved, retry idempotent');
select public.passport_assert((select visit_count = 2 and pint_count = 0 and latest_photo_path is not null
  and pub_name = 'First Pub' and most_recent_visit is not null
  from public.get_my_pub_passport() where pub_place_id = 'pub-one'), 'Passport saved with date and one photo reference');
select public.passport_assert(public.can_review_pub('google_places','pub-one'), 'standalone review eligibility');
select * from public.create_passport_pub_review('google_places','pub-one',4::smallint,4::smallint,4::smallint,4::smallint,true,null,null,'Passport community review');
select * from public.update_pub_review(
 (select current_user_review_id from public.get_pub_review_summary('google_places','pub-one')),
 5::smallint,4::smallint,4::smallint,4::smallint,true,null,null,'Updated Passport community review');
reset role;
select public.passport_assert((select count(*) = 0 from public.league_memberships), 'visit and review work with no active War');
select public.passport_assert((select count(*) = 0 from public.league_score_events), 'Passport awards zero score events');
select public.passport_assert((select count(*) = 0 from public.pub_review_bonus_guards), 'Passport awards zero bonus guards');
select 'PASS: no-War visits, one-photo requirement, repeat visits, review create/edit and zero points' as result;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set role authenticated;
select public.passport_assert((select count(*) = 0 from public.pub_visits), 'other users cannot read visits');
select public.passport_assert((select count(*) = 0 from storage.objects where name like '%/passport/%'), 'other users cannot read private photos');
select public.passport_assert((select count(*) = 1 from public.get_pub_reviews('google_places','pub-one')), 'community review is visible to another user');
select public.passport_expect_failure(
 $$insert into storage.objects(bucket_id,name) values ('pint-proofs','11111111-1111-4111-8111-111111111111/passport/foreign.jpg')$$,
 'row-level security');
select public.passport_expect_failure(
 $$select * from public.create_passport_pub_review('google_places','pub-one',4::smallint,4::smallint,4::smallint,4::smallint,true)$$,
 'Log a Passport visit');
reset role;
select public.passport_assert((select public is false from storage.buckets where id='pint-proofs'), 'photo bucket remains private');
select 'PASS: owner-only visit/photo access and shared community reviews' as result;

insert into public.leagues(id,name,host_id,capacity,is_free,status,starts_at,ends_at,duration_days)
 values ('99999999-9999-4999-8999-999999999999','Regression War','11111111-1111-4111-8111-111111111111',
 4,true,'active',now()-interval '1 hour',now()+interval '9 days',10);
insert into public.league_memberships(league_id,user_id,role,status)
 values ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','host','active');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set role authenticated;
insert into storage.objects(bucket_id,name) values
 ('pint-proofs','11111111-1111-4111-8111-111111111111/passport/active-war.jpg'),
 ('pint-proofs','11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999/war-proof.jpg');
select * from public.log_passport_visit('google_places','pub-two','Second Pub','London',51.5,-0.1,
 '11111111-1111-4111-8111-111111111111/passport/active-war.jpg');
select * from public.create_passport_pub_review('google_places','pub-two',4::smallint,4::smallint,4::smallint,4::smallint,true);
reset role;
select public.passport_assert((select count(*) = 0 from public.league_score_events), 'active-War Passport visit/review unscored');
select public.passport_assert((select count(*) = 0 from public.pub_review_bonus_guards), 'active-War Passport creates no bonus guards');
set request.jwt.claim.role = 'service_role';
set role service_role;
select * from public.log_pint_verified(
 '11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999',
 '11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999/war-proof.jpg',
 repeat('a',64),51.5,-0.1,'google_places','war-pub','War Pub','London',51.5,-0.1) \gset war_
reset role;
set request.jwt.claim.role = 'authenticated';
set role authenticated;
select * from public.create_pub_review('google_places','war-pub',
 :'war_pint_id'::uuid,
 4::smallint,4::smallint,4::smallint,4::smallint,true);
select public.passport_assert((select pint_count=1 and visit_count=0
 from public.get_my_pub_passport() where pub_place_id='war-pub'), 'legacy War Passport entries retained');
reset role;
select public.passport_assert((select sum(points)=2 and count(*)=2 from public.league_score_events), 'War pint +1 and qualifying review +1 still work');
select public.passport_assert((select count(*)=1 from public.pub_review_bonus_guards), 'War review bonus still works');
select 'PASS: active-War Passport remains unscored; existing War pint/review scoring preserved' as result;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set role authenticated;
insert into storage.objects(bucket_id,name)
 values ('pint-proofs','22222222-2222-4222-8222-222222222222/passport/delete-me.jpg');
select * from public.log_passport_visit('google_places','delete-pub','Deleted Visit','London',51.5,-0.1,
 '22222222-2222-4222-8222-222222222222/passport/delete-me.jpg');
select * from public.delete_my_account();
reset role;
select public.passport_assert((select count(*)=0 from public.pub_visits where user_id='22222222-2222-4222-8222-222222222222'), 'visit records cascade on account deletion');
select public.passport_assert((select storage_prefix='22222222-2222-4222-8222-222222222222/' from public.account_deletion_jobs
 where user_id='22222222-2222-4222-8222-222222222222'), 'Passport photo lies inside existing recursive cleanup prefix');
select 'PASS: account deletion removes visits and includes photos in its trusted cleanup prefix' as result;
