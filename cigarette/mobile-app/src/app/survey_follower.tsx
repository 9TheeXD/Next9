import { Redirect } from 'expo-router';
export default function SurveyFollowerRedirect() {
  return <Redirect href={"/onboarding" as any} />;
}
