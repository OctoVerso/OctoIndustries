insert into public.games (
  id,
  title,
  description,
  category,
  tags,
  featured,
  launch,
  thumbnail,
  offline_ready,
  status
) values (
  'drive-mad',
  'Drive Mad',
  'Take control of a car and navigate physics-driven obstacle courses in Drive Mad.',
  'Driving',
  array['Driving', 'Physics', 'Racing', 'Vehicles', 'Obstacles', 'Casual', 'Mobile Classic'],
  false,
  'Octo-Industries/Drive-Mad/index.html',
  'Octo-Industries/Drive-Mad/webapp/cover.jpg',
  true,
  'published'
)
on conflict (id) do nothing;
