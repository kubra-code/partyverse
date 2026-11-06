create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) on delete set null,
  title text not null,
  game_type text not null default 'court',
  room_code text unique not null,
  status text not null default 'lobby',
  created_at timestamptz default now()
);

create table if not exists event_players (
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (event_id, user_id)
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'court',
  title text not null,
  description text not null
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  round_number int not null,
  case_id uuid references cases(id),
  judge_id uuid references profiles(id),
  defendant_id uuid references profiles(id),
  witness_id uuid references profiles(id),
  verdict text,
  created_at timestamptz default now()
);

create table if not exists votes (
  round_id uuid references rounds(id) on delete cascade,
  voter_id uuid references profiles(id) on delete cascade,
  vote text not null check (vote in ('innocent','guilty')),
  primary key (round_id, voter_id)
);

insert into cases (title, description) values
('سرقة الكشري', 'المتهم اتقبض عليه وهو بياكل آخر طبق كشري في الشغل، والكل بيقول إنه كان بتاع زميله.'),
('اختفاء الشاحن', 'شاحن الموبايل الوحيد في المكتب اختفى، والمتهم آخر واحد شافوه جنبه.'),
('خيانة الجروب', 'المتهم اتهم إنه عمل ليفت من جروب الأصحاب يوم الخروجة من غير ما يقول.'),
('سبق التسريب', 'المتهم اتهم إنه حرق أحداث الحلقة الأخيرة من المسلسل قدام الكل.'),
('الدور المخطوف', 'المتهم اتهم إنه خد دور واحد في الطابور وهو مش واقف فيه.');