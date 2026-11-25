import type { AvatarId } from "../../shared/game";

export const AVATARS: { id: AvatarId; name: string; body: string }[] = [
  {
    id: "hat",
    name: "Top hat",
    body: `<path d="M20 40V11h24v29Z"/><path d="M8 46l8-8h32l8 8-8 6H16Z"/><path d="M20 23h24v8H20Z"/>`,
  },
  {
    id: "house",
    name: "House",
    body: `<path d="M32 8L54 26V54H10V26Z"/><path d="M26 54V40h12v14" fill="none"/><circle cx="32" cy="27" r="3" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "hotel",
    name: "Hotel",
    body: `<path d="M14 17h36v39H14Z"/><path d="M10 8h44v9H10Z"/><path d="M20 25h7v7h-7ZM37 25h7v7h-7ZM20 37h7v7h-7ZM37 37h7v7h-7Z" fill="none" stroke-width="2.5"/><path d="M28 56V49h8v7" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "dice",
    name: "Dice",
    body: `<path d="M32 8L52.8 20L52.8 44L32 56L11.2 44L11.2 20Z"/><path d="M11.2 20L32 32 52.8 20M32 32V56" fill="none"/><circle cx="32" cy="20" r="2.4" fill="#f5f0fa" stroke="none"/><circle cx="17" cy="30.1" r="2.4" fill="#f5f0fa" stroke="none"/><circle cx="26.2" cy="45.9" r="2.4" fill="#f5f0fa" stroke="none"/><circle cx="37.2" cy="35" r="2.4" fill="#f5f0fa" stroke="none"/><circle cx="42.4" cy="38" r="2.4" fill="#f5f0fa" stroke="none"/><circle cx="47.6" cy="41" r="2.4" fill="#f5f0fa" stroke="none"/>`,
  },
  {
    id: "coin",
    name: "Coin",
    body: `<path d="M55.1 41.6L41.6 55.1L22.4 55.1L8.9 41.6L8.9 22.4L22.4 8.9L41.6 8.9L55.1 22.4Z"/><path d="M39 26C39 22 36 19 32 19 28 19 25 22 25 26 25 30 28.5 31 32 32 35.5 33 39 34 39 38 39 42 36 45 32 45 28 45 25 42 25 38" fill="none"/><path d="M32 14.5v4.5M32 45v4.5" fill="none"/>`,
  },
  {
    id: "key",
    name: "Key",
    body: `<g transform="rotate(-35 32 32)"><path d="M31 28H57V40H52V36H50V44H44V36H31Z"/><path d="M31 32L25 42.4L13 42.4L7 32L13 21.6L25 21.6Z"/><path d="M23.5 32L21.2 35.9L16.8 35.9L14.5 32L16.8 28.1L21.2 28.1Z" fill="none" stroke-width="2.5"/></g>`,
  },
  {
    id: "crown",
    name: "Crown",
    body: `<path d="M11 46L9 20l14 12 9-18 9 18 14-12-2 26Z"/><path d="M11 46h42v10H11Z"/><path d="M32 48.5l3.5 2.5-3.5 2.5-3.5-2.5Z" fill="#f5f0fa" stroke="none"/>`,
  },
  {
    id: "car",
    name: "Car",
    body: `<path d="M6 42V35l8-3 7-11h20l8 11 9 3v7Z"/><path d="M25 25h14l5 7H20Z" fill="none" stroke-width="2.5"/><circle cx="19" cy="44" r="7"/><circle cx="47" cy="44" r="7"/>`,
  },
  {
    id: "boat",
    name: "Sailboat",
    body: `<path d="M35 12L52 38H35Z"/><path d="M29 20V38H13Z"/><path d="M8 42h48l-8 12H16Z"/><path d="M32 8v30" fill="none"/>`,
  },
  {
    id: "rocket",
    name: "Rocket",
    body: `<path d="M27 44h10L32 58Z"/><path d="M22 30L11 44v8l11-6ZM42 30l11 14v8l-11-6Z"/><path d="M32 5L42 17V44H22V17Z"/><circle cx="32" cy="27" r="4.5" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "cat",
    name: "Cat",
    body: `<path d="M12 12L25 21H39L52 12V36L40 54H24L12 36Z"/><circle cx="24" cy="33" r="3" fill="#f5f0fa" stroke="none"/><circle cx="40" cy="33" r="3" fill="#f5f0fa" stroke="none"/><path d="M29 41h6l-3 4Z" fill="#f5f0fa" stroke-width="1.5"/><path d="M5 38l8 2M5 46l8-3M59 38l-8 2M59 46l-8-3" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "star",
    name: "Pentagram",
    body: `<path d="M32 10L55.8 27.3L46.7 55.2L17.3 55.2L8.2 27.3Z"/><path d="M32 10L46.7 55.2 8.2 27.3 55.8 27.3 17.3 55.2Z" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "bot",
    name: "Hexbot",
    body: `<path d="M5 30h7v12H5ZM52 30h7v12h-7Z"/><path d="M32 16V9" fill="none"/><circle cx="32" cy="7.5" r="3.5"/><path d="M52.3 44.4L40.4 56.3L23.6 56.3L11.7 44.4L11.7 27.6L23.6 15.7L40.4 15.7L52.3 27.6Z"/><circle cx="24" cy="33" r="3.5" fill="#f5f0fa" stroke="none"/><circle cx="40" cy="33" r="3.5" fill="#f5f0fa" stroke="none"/><path d="M24 44h16" fill="none" stroke-width="2.5"/>`,
  },
  {
    id: "protractor",
    name: "Protractor",
    body: `<path d="M8 48a24 24 0 0 1 48 0Z"/><path d="M5 48h54v8H5Z"/><path d="M52.8 36L46.7 39.5M44 27.2L40.5 33.3M32 24L32 31M20 27.2L23.5 33.3M11.2 36L17.3 39.5" fill="none" stroke-width="2.5"/><circle cx="32" cy="48" r="2" fill="#f5f0fa" stroke="none"/>`,
  },
  {
    id: "chance",
    name: "Chance",
    body: `<path d="M32 6L54.5 19L54.5 45L32 58L9.5 45L9.5 19Z"/><path d="M24 25C24 20 27.5 17 32 17 36.5 17 40 20 40 24.5 40 30 32 30.5 32 37" fill="none" stroke-width="4"/><circle cx="32" cy="45" r="2.8" fill="#f5f0fa" stroke="none"/>`,
  },
];

export function Avatar({ id, size = 40 }: { id: string; size?: number }) {
  const a = AVATARS.find((x) => x.id === id) ?? AVATARS[0];
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={a.name}
      fill="#2c2239"
      stroke="#f5f0fa"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: a.body }}
    />
  );
}
