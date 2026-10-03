// 공동 저장소(Supabase) 접근. 이 파일 밖에서는 supabase 클라이언트를 직접 쓰지 않습니다.
import { supabase } from './supabase.js';

// 식당 + 후기를 한 번에 읽습니다. 후기는 오래된 순이라
//   reviews[0]      = 추천 이유(첫 후기)
//   reviews.at(-1)  = 최신 후기
const SELECT_WITH_REVIEWS = `
  id, name, region, address, cuisine, sub, menu, menus, price, price_note,
  tags, link, source_type, info_checked_on,
  hours, reserve, wait, walk_min, dist_m, icon,
  lat, lng, kakao_place_id, created_at,
  reviews ( id, author_name, body, kind, situation, people, paid, created_at )
`;

function sortReviews(rows) {
  for (const r of rows) {
    r.reviews = (r.reviews || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return rows;
}

export async function fetchRestaurants() {
  const { data, error } = await supabase
    .from('restaurants')
    .select(SELECT_WITH_REVIEWS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return sortReviews(data || []);
}

export async function fetchRestaurant(id) {
  const { data, error } = await supabase
    .from('restaurants')
    .select(SELECT_WITH_REVIEWS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return sortReviews([data])[0];
}

// 식당 + 첫 후기를 한 트랜잭션으로 저장합니다(schema.sql의 RPC).
export async function createRestaurant(input) {
  const { data, error } = await supabase.rpc('create_restaurant_with_review', {
    p_name: input.name,
    p_region: input.region,
    p_address: input.address,
    p_cuisine: input.cuisine,
    p_sub: input.sub || null,
    p_menu: input.menu,
    p_price: input.price,            // null 허용 = 가격 미확인
    p_tags: input.tags,
    p_link: input.link || null,
    p_source_type: input.sourceType || null,
    p_author_name: input.authorName || null,
    p_body: input.reason,
  });

  if (error) throw error;
  return data;
}

export async function createReview({ restaurantId, authorName, body, situation, people, paid }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error('NOT_AUTHENTICATED');

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      restaurant_id: restaurantId,
      author_name: authorName || null,
      body,
      kind: 'member',
      situation: situation || null,
      people: people || null,
      paid: paid ?? null,
      created_by: uid,
    })
    .select('id, author_name, body, kind, situation, people, paid, created_at')
    .single();

  if (error) throw error;
  return data;
}

// DB가 돌려준 오류를 사용자에게 보여줄 한 줄로 바꿉니다.
export function describeError(error) {
  const text = String(error?.message || error || '');
  if (text.includes('RATE_LIMITED')) {
    return '짧은 시간에 너무 많이 등록했어요. 잠시 후 다시 시도해주세요.';
  }
  if (text.includes('NOT_AUTHENTICATED') || error?.code === '42501') {
    return '로그인이 필요해요. 다시 로그인해주세요.';
  }
  if (error?.code === '23514') {
    return '입력한 값 중 저장할 수 없는 항목이 있어요. 가격과 링크 형식을 확인해주세요.';
  }
  return '';
}
