import { notFound } from 'next/navigation';
import { isProduction } from '@/shared/config';
import { ChartsSection } from '../_stand/charts-section';
import { EntitiesSection } from '../_stand/entities-section';
import { InputsSection } from '../_stand/inputs-section';
import { StatesSection } from '../_stand/states-section';
import { TableSection } from '../_stand/table-section';
import { ValuesSection } from '../_stand/values-section';

/** Component stand (spec §6 rule 7): development only. Light and dark come from the OS scheme. */
export default function ComponentStandPage() {
  if (isProduction) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Component stand</h1>
      <StatesSection />
      <InputsSection />
      <TableSection />
      <ValuesSection />
      <EntitiesSection />
      <ChartsSection />
    </main>
  );
}
