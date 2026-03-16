import type { PersonaRecord } from '../api/types';

type Props = {
  personas: PersonaRecord[];
  value: string;
  onChange: (next: string) => void;
};

export const PersonaPicker = ({ personas, value, onChange }: Props): JSX.Element => {
  return (
    <label className="field">
      Active persona
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {personas.length === 0 && <option value={value}>{value}</option>}
        {personas.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.name ?? persona.id}
          </option>
        ))}
      </select>
    </label>
  );
};
