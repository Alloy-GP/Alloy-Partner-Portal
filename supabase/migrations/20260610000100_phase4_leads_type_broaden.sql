-- WhatConverts has more lead types than the original call/form seed enum.
alter table leads drop constraint if exists leads_type_check;
alter table leads add constraint leads_type_check
  check (type = any (array['call','form','chat','sale','appointment','event','text','lead']));
