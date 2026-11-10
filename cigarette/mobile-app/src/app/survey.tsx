import { Redirect } from 'expo-router';
export default function SurveyRedirect() {
  return <Redirect href={"/onboarding" as any} />;
}
