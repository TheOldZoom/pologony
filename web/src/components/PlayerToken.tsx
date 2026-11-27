import {
  Angle,
  Bot,
  CarFront,
  Cat,
  CircleDollarSign,
  CircleQuestionMark,
  Crown,
  Dice5,
  HatGlasses,
  Hotel,
  House,
  KeyRound,
  Rocket,
  Sailboat,
  Star,
} from 'lucide-react';
import { type AvatarId, type Player } from '../../../shared/game';

const avatarIcons = {
  hat: HatGlasses,
  house: House,
  hotel: Hotel,
  dice: Dice5,
  coin: CircleDollarSign,
  key: KeyRound,
  crown: Crown,
  car: CarFront,
  boat: Sailboat,
  rocket: Rocket,
  cat: Cat,
  star: Star,
  bot: Bot,
  protractor: Angle,
  chance: CircleQuestionMark,
};

export function PlayerAvatar({ id }: { id: AvatarId }) {
  const Icon = avatarIcons[id];
  return <Icon className="avatar-glyph" color="#f5f0fa" aria-hidden="true" />;
}

export function PlayerToken({ player, size = 30 }: { player: Player; size?: number }) {
  return (
    <span
      className="player-token"
      style={{
        backgroundColor: player.color,
        width: size + 6,
        height: size + 6,
      }}
      aria-hidden="true"
    >
      <PlayerAvatar id={player.avatar} />
    </span>
  );
}
