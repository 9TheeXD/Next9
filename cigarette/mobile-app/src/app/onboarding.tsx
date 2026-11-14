import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Platform, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAlert } from "@/contexts/AlertContext";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api";

// =====================
// Types for API Config
// =====================
interface FieldConfig {
  key: string;
  label: string;
  required: boolean;
  type: 'radio' | 'text' | 'checkbox';
  options?: string[];
  hasOther?: boolean;
  placeholder?: string;
  conditional?: string;
  conditionalValue?: string;
  conditionalShowKeys?: string[];
  conditionalShowValues?: string[];
}

interface FTNDOption {
  text: string;
  score: number;
}

interface FTNDQuestion {
  key: string;
  label: string;
  required: boolean;
  options: FTNDOption[];
}

interface DiseaseRisk {
  id: string;
  title: string;
  subtitle: string;
  riskFactorText: string;
  source: string;
  color: string;
  icon: string;
  details: string;
}

interface RecoveryMilestone {
  time: string;
  benefit: string;
}

interface RiskLevel {
  range: [number, number];
  level: string;
  name: string;
  color: string;
  description: string;
  tips: string[];
}

interface OnboardingConfig {
  basicInfo: {
    title: string;
    fields: FieldConfig[];
  };
  smokingBehavior: {
    title: string;
    roleQuestion: FieldConfig & { smokerValues: string[] };
    smokerFields: FieldConfig[];
  };
  ftndTest: {
    title: string;
    subtitle: string;
    reference: string;
    questions: FTNDQuestion[];
    supplementary: FieldConfig[];
  };
  followerQuestions: {
    title: string;
    fields: FieldConfig[];
  };
  motivation: {
    title: string;
    fields: FieldConfig[];
  };
  riskAssessment: {
    levels: RiskLevel[];
    diseaseRisks?: DiseaseRisk[];
    recoveryTimeline?: RecoveryMilestone[];
    hotlineNumber: string;
    hotlineThreshold: number;
    lineOaUrl: string;
  };
}

// =====================
// RadioGroup Component
// =====================
interface RadioGroupProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  hasOther?: boolean;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}

function RadioGroup({ options, value, onChange, hasOther, otherValue, onOtherChange }: RadioGroupProps) {
  return (
    <View style={styles.radioGroup}>
      {options.map((opt: string) => (
        <Pressable key={opt} style={styles.radioItem} onPress={() => onChange(opt)}>
          <View style={[styles.radioCircle, value === opt && styles.radioCircleSelected]} />
          <Text style={styles.radioText}>{opt}</Text>
        </Pressable>
      ))}
      {hasOther && (
        <View style={styles.otherContainer}>
          <Pressable style={styles.radioItem} onPress={() => onChange('อื่นๆ')}>
            <View style={[styles.radioCircle, value === 'อื่นๆ' && styles.radioCircleSelected]} />
            <Text style={styles.radioText}>อื่นๆ</Text>
          </Pressable>
          {value === 'อื่นๆ' && (
            <TextInput
              style={styles.textInput}
              value={otherValue}
              onChangeText={onOtherChange}
              placeholder="โปรดระบุ"
            />
          )}
        </View>
      )}
    </View>
  );
}

function CheckboxGroup({ options, value, onChange }: Omit<RadioGroupProps, 'hasOther' | 'otherValue' | 'onOtherChange'>) {
  const selectedValues = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  
  const toggleOption = (opt: string) => {
    let newValues;
    if (selectedValues.includes(opt)) {
      newValues = selectedValues.filter(v => v !== opt);
    } else {
      newValues = [...selectedValues, opt];
    }
    onChange(newValues.join(','));
  };

  return (
    <View style={styles.radioGroup}>
      {options.map((opt: string) => (
        <Pressable key={opt} style={styles.radioItem} onPress={() => toggleOption(opt)}>
          <View style={[styles.checkboxSquare, selectedValues.includes(opt) && styles.checkboxSquareSelected]} />
          <Text style={styles.radioText}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// =====================
// Dynamic Field Renderer
// =====================
function DynamicField({
  field,
  value,
  onChange,
  otherValue,
  onOtherChange,
  hasError,
}: {
  field: FieldConfig;
  value: string;
  onChange: (v: string) => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  hasError?: boolean;
}) {
  return (
    <View 
      nativeID={`field-${field.key}`}
      style={[styles.formSection, hasError && { borderColor: '#ef4444', borderWidth: 2 }]}
    >
      <Text style={styles.question}>
        {field.label}{' '}
        {field.required && <Text style={{ color: '#ef4444' }}>(จำเป็น)</Text>}
      </Text>
      
      {field.type === 'text' ? (
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder || 'โปรดระบุ'}
        />
      ) : field.type === 'checkbox' ? (
        <CheckboxGroup
          options={field.options || []}
          value={value}
          onChange={onChange}
        />
      ) : (
        <RadioGroup
          options={field.options || []}
          value={value}
          onChange={onChange}
          hasOther={field.hasOther}
          otherValue={otherValue}
          onOtherChange={onOtherChange}
        />
      )}

      {hasError && (
        <Text style={{ color: '#ef4444', fontSize: 14, marginTop: 12, fontWeight: 'bold' }}>
          กรุณากรอกข้อมูลในส่วนนี้ให้ครบถ้วน
        </Text>
      )}

      {!field.required && value !== '' && (
        <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Pressable 
            onPress={() => {
              onChange('');
              if (onOtherChange) onOtherChange('');
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f1f5f9', borderRadius: 6 }}
          >
            <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>ล้าง</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Nothing in the questionnaire is mandatory: every answer helps tune the app, none is needed to use it.
function relaxConfig<T>(x: T): T {
  if (Array.isArray(x)) return x.map(relaxConfig) as unknown as T;
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      out[k] = k === 'required' ? false : relaxConfig(v);
    }
    return out as T;
  }
  return x;
}

// =====================
// Main Component
// =====================
export default function OnboardingWizard() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const { register, user, upgradeRole } = useAuth();
  const params = useLocalSearchParams<{ as?: string }>();
  // Chosen on the welcome screen: the questions below fit that path and are all optional.
  const intent: 'smoker' | 'follower' | null =
    params.as === 'smoker' ? 'smoker' : params.as === 'follower' ? 'follower' : null;
  // A "try the app" account that now picks a path keeps its ID and coins.
  const upgrading = user?.role === 'EXPLORER';

  const [step, setStep] = useState(1);
  const [displayId, setDisplayId] = useState('');
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [config, setConfig] = useState<OnboardingConfig | null>(null);

  // Form values stored as a flat map keyed by field key
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToTop = useCallback(() => {
    try {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    } catch {}
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const topAnchor = document.getElementById('onboarding-top-anchor');
        if (topAnchor) {
          topAnchor.scrollIntoView({ behavior: 'auto', block: 'start' });
        }

        const scrollEl = document.getElementById('onboarding-scroll-view') || (scrollViewRef.current as any)?.getScrollableNode?.();
        if (scrollEl) {
          scrollEl.scrollTop = 0;
          if (typeof scrollEl.scrollTo === 'function') {
            scrollEl.scrollTo(0, 0);
          }
        }

        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;

        let parent = topAnchor?.parentElement;
        while (parent) {
          if (parent.scrollTop > 0) {
            parent.scrollTop = 0;
          }
          parent = parent.parentElement;
        }
      } catch (e) {
        console.warn('Scroll top error:', e);
      }
    }
  }, []);

  const scrollToField = useCallback((fieldKey: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const el = document.getElementById(`field-${fieldKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      } catch {}
    }
    scrollToTop();
  }, [scrollToTop]);

  // Scroll to top when step changes
  useEffect(() => {
    scrollToTop();
    requestAnimationFrame(scrollToTop);
    const t1 = setTimeout(scrollToTop, 50);
    const t2 = setTimeout(scrollToTop, 200);
    setErrors({});
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step, scrollToTop]);

  // Load config from API
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`${API_BASE_URL}/public/onboarding-config`);
        const json = await res.json();
        if (json.success && json.data) {
          setConfig(relaxConfig(json.data));
        } else {
          showAlert({ message: "ไม่สามารถโหลดแบบฟอร์มได้", type: "error" });
        }
      } catch (e) {
        showAlert({ message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", type: "error" });
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, []);

  // Generate/load displayId
  useEffect(() => {
    async function init() {
      let id = '';
      if (Platform.OS === 'web') {
        const match = document.cookie.match(/(^| )ciga_display_id=([^;]+)/);
        if (match) id = match[2];
      }
      if (!id) id = await AsyncStorage.getItem("ciga_display_id") || '';
      if (!id) {
        id = Math.floor(Math.random() * 9000 + 1000).toString();
        await AsyncStorage.setItem("ciga_display_id", id);
        if (Platform.OS === 'web') {
          document.cookie = `ciga_display_id=${id}; path=/; max-age=31536000`;
        }
      }
      setDisplayId(id);
    }
    init();
  }, []);

  useEffect(() => {
    if (upgrading && user?.displayId) setDisplayId(user.displayId);
  }, [upgrading, user?.displayId]);

  const updateForm = useCallback((key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: false }));
  }, []);

  // Derived state
  const isSmoker = config
    ? form.isSmokerStr
      ? config.smokingBehavior.roleQuestion.smokerValues.includes(form.isSmokerStr)
      : intent === 'smoker'
    : false;
  // Steps this person will see, e.g. a supporter skips the smoking-habit page.
  const stepList = isSmoker ? [1, 2, 3, 4, 5] : intent === 'follower' ? [1, 3, 5] : [1, 2, 3, 5];
  const isNonSmoker = form.isSmokerStr === 'ไม่เคยสูบเลย';

  // FTND Score calculation from config
  const calculateFTND = useCallback((): number => {
    if (!config) return 0;
    let score = 0;
    for (const q of config.ftndTest.questions) {
      const answer = form[q.key];
      if (answer) {
        const opt = q.options.find(o => o.text === answer);
        if (opt) score += opt.score;
      }
    }
    return score;
  }, [config, form]);

  const getFTNDLevel = useCallback((score: number): RiskLevel | null => {
    if (!config) return null;
    for (const level of config.riskAssessment.levels) {
      if (score >= level.range[0] && score <= level.range[1]) {
        return level;
      }
    }
    return config.riskAssessment.levels[config.riskAssessment.levels.length - 1];
  }, [config]);

  const calculateExposure = useCallback(() => {
    const cigStr = form.ftnd4 || form.amountPerDay || '';
    let cigs = 10;
    if (cigStr.includes('10 มวนหรือน้อยกว่า') || cigStr.includes('1-5') || cigStr.includes('6-10')) cigs = 10;
    else if (cigStr.includes('11-20')) cigs = 15;
    else if (cigStr.includes('21-30')) cigs = 25;
    else if (cigStr.includes('มากกว่า 30') || cigStr.includes('30+')) cigs = 35;

    const durStr = form.smokingDuration || '';
    let years = 1;
    let durLabel = 'ไม่ระบุ';
    if (durStr.includes('น้อยกว่า 1 เดือน')) { years = 0.1; durLabel = '< 1 เดือน'; }
    else if (durStr.includes('1-6 เดือน')) { years = 0.5; durLabel = '1-6 เดือน'; }
    else if (durStr.includes('6 เดือน - 2 ปี')) { years = 1.5; durLabel = '6 เดือน - 2 ปี'; }
    else if (durStr.includes('มากกว่า 2 ปี')) { years = 5; durLabel = '> 2 ปี'; }

    const packYears = ((cigs / 20) * years).toFixed(1);
    const isHeavyDaily = cigs >= 25;

    return {
      cigs,
      cigLabel: cigStr || '10 มวนหรือน้อยกว่า',
      years,
      durLabel,
      packYears: parseFloat(packYears),
      isHeavyDaily,
    };
  }, [form]);

  // Helper when validation fails
  const onValidationFail = (errs: Record<string, boolean>) => {
    setErrors(errs);
    const firstKey = Object.keys(errs)[0];
    setTimeout(() => {
      scrollToField(firstKey);
    }, 50);
  };

  // Navigation validation
  const handleNext = () => {
    if (!config) return;
    const newErrors: Record<string, boolean> = {};

    if (step === 1) {
      for (const field of config.basicInfo.fields) {
        if (field.required && !form[field.key]) newErrors[field.key] = true;
      }
      if (Object.keys(newErrors).length > 0) {
        onValidationFail(newErrors);
        return;
      }
      setStep(intent === 'follower' ? 3 : 2);
      scrollToTop();
    } else if (step === 2) {
      if (form.isSmokerStr && isSmoker) {
        for (const field of config.smokingBehavior.smokerFields) {
          if (field.required && !form[field.key]) newErrors[field.key] = true;
        }
      }

      if (Object.keys(newErrors).length > 0) {
        onValidationFail(newErrors);
        return;
      }
      setStep(3);
      scrollToTop();
    } else if (step === 3) {
      if (isSmoker) {
        for (const q of config.ftndTest.questions) {
          if (q.required && !form[q.key]) newErrors[q.key] = true;
        }
        if (Object.keys(newErrors).length > 0) {
          onValidationFail(newErrors);
          return;
        }
        setStep(4);
        scrollToTop();
      } else {
        if (form.hasSmoker === 'ไม่มี') {
          void finishWithoutSurvey();
        } else {
          setStep(5);
          scrollToTop();
        }
      }
    } else if (step === 4) {
      if (isSmoker) {
        if (Object.keys(newErrors).length > 0) {
          onValidationFail(newErrors);
          return;
        }
        setStep(5);
        scrollToTop();
      }
    }
  };

  const handleBack = () => {
    if (step === 1) {
      router.replace(user ? '/(tabs)' : ('/(auth)/login' as any));
      return;
    }
    const i = stepList.indexOf(step);
    setStep(i > 0 ? stepList[i - 1] : 1);
    scrollToTop();
  };

  // No smoker to help and nothing to ask: just start exploring the app.
  const finishWithoutSurvey = async () => {
    setLoading(true);
    try {
      if (!upgrading) await register({ displayId, role: 'EXPLORER' });
      router.replace('/(tabs)');
    } catch (e: any) {
      showAlert({ message: e.message || 'เริ่มใช้งานไม่สำเร็จ ลองใหม่อีกครั้ง', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // "Skip the rest": send what has been answered so far (or just start exploring).
  const skipRest = () => {
    if (!intent && !form.isSmokerStr) void finishWithoutSurvey();
    else void handleSubmit();
  };

  // Submit
  const handleSubmit = async () => {
    if (!config) return;
    setLoading(true);
    try {
      if (isSmoker) {
        const riskScore = calculateFTND();
        const riskData = getFTNDLevel(riskScore);

        const payload = {
          displayId,
          ageGroup: form.ageGroup || 'ไม่ระบุ',
          gender: form.gender || 'ไม่ระบุ',
          smokingType: form.smokingType,
          frequency: form.ftnd4 || form.amountPerDay || "10 มวนหรือน้อยกว่า",
          cravingTime: form.cravingTime,
          duration: form.smokingDuration,
          wantedToQuit: form.wantToQuit,
          reasonToQuit: form.reasonToQuit,
          previousMethods: form.previousMethods,
          longestQuit: form.longestQuit,
          interestedInApp: form.interestedHelp,
          riskScore: riskScore,
          riskLevel: riskData?.level,
          addictionLevel: riskData?.name || '',
          copingStrategy: form.q7,
          failedQuitAttempt: form.q8 || (form.previousMethods ? "เคย" : "ไม่เคย"),
        };

        const res = await fetch(`${API_BASE_URL}/survey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          try {
            if (upgrading) await upgradeRole('SMOKER');
            else await register({ displayId, role: 'SMOKER' });
            router.replace('/(tabs)');
          } catch (e: any) {
            showAlert({ 
              message: `${e.message || "ลงทะเบียนผู้ใช้ไม่สำเร็จ"}\n\nหากปัญหายังคงอยู่ โปรดติดต่อทีมงาน (รหัสของคุณ: ${displayId})`, 
              type: "error" 
            });
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          showAlert({ 
            message: `บันทึกข้อมูลไม่สำเร็จ: ${errData.error || "เซิร์ฟเวอร์ขัดข้อง"}\n\nโปรดตรวจสอบข้อมูลอีกครั้ง หรือติดต่อทีมงาน (รหัสของคุณ: ${displayId})`, 
            type: "error" 
          });
        }
      } else {
        const concernFinal = form.concern === 'อื่นๆ' ? form.concernOther : form.concern;
        const payload = {
          displayId,
          relation: form.relationship,
          smokingFrequency: form.frequencyView,
          concern: concernFinal,
          supportMethod: form.helpMethod,
          reward: form.gift,
        };

        const res = await fetch(`${API_BASE_URL}/survey/follower`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          try {
            if (upgrading) await upgradeRole('FAMILY', form.smokerCode || undefined);
            else {
              await register({
                displayId,
                role: 'FAMILY',
                ...(form.smokerCode ? { targetDisplayId: form.smokerCode } : {})
              });
            }
            router.replace('/(tabs)');
          } catch (e: any) {
            showAlert({ 
              message: `${e.message || "ลงทะเบียนผู้ใช้ไม่สำเร็จ"}\n\nโปรดตรวจสอบรหัสผู้สูบอีกครั้ง หรือติดต่อทีมงาน (รหัสของคุณ: ${displayId})`, 
              type: "error" 
            });
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          showAlert({ 
            message: `บันทึกข้อมูลไม่สำเร็จ: ${errData.error || "เซิร์ฟเวอร์ขัดข้อง"}\n\nโปรดตรวจสอบว่ากรอกข้อมูลครบถ้วน หรือติดต่อทีมงาน (รหัสของคุณ: ${displayId})`, 
            type: "error" 
          });
        }
      }
    } catch (e: any) {
      showAlert({ 
        message: `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้\n\nกรุณาตรวจสอบอินเทอร์เน็ตของคุณ หากยังพบปัญหาโปรดติดต่อทีมงาน (รหัสของคุณ: ${displayId})`, 
        type: "error" 
      });
    } finally {
      setLoading(false);
    }
  };

  // Progress bar
  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={[styles.progressBar, { width: `${(Math.max(1, stepList.indexOf(step) + 1) / stepList.length) * 100}%` }]} />
    </View>
  );

  // =====================
  // Page Renderers
  // =====================

  const renderPage1 = () => {
    if (!config) return null;
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>{config.basicInfo.title}</Text>
        <View style={styles.privacyCard}>
          <Feather name="shield" size={18} color="#0f766e" style={{ marginTop: 2 }} />
          <Text style={styles.privacyCardText}>
            ตอบเท่าที่สบายใจ ข้อไหนไม่อยากตอบก็ข้ามได้ ไม่ต้องบอกชื่อจริง เบอร์โทร หรือที่อยู่ คำตอบใช้ปรับแอปให้เหมาะกับคุณ และดูเป็นภาพรวมโดยไม่ระบุตัวตน
          </Text>
        </View>
        {config.basicInfo.fields.map(field => (
          <DynamicField
            key={field.key}
            field={field}
            value={form[field.key] || ''}
            onChange={(v: string) => updateForm(field.key, v)}
            hasError={errors[field.key]}
          />
        ))}
      </View>
    );
  };

  const renderPage2 = () => {
    if (!config) return null;
    const rq = config.smokingBehavior.roleQuestion;
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>{config.smokingBehavior.title}</Text>
        {!intent && (
          <DynamicField
            field={rq}
            value={form[rq.key] || ''}
            onChange={(v: string) => updateForm(rq.key, v)}
            hasError={errors[rq.key]}
          />
        )}
        {isSmoker && config.smokingBehavior.smokerFields.map(field => (
          <DynamicField
            key={field.key}
            field={field}
            value={form[field.key] || ''}
            onChange={(v: string) => updateForm(field.key, v)}
            hasError={errors[field.key]}
          />
        ))}
      </View>
    );
  };

  const renderPage3Smoker = () => {
    if (!config) return null;
    const ftnd = config.ftndTest;
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>{ftnd.title}</Text>
        <Text style={styles.subtitle}>{ftnd.subtitle}</Text>

        {ftnd.questions.map((q, i) => (
          <View 
            key={q.key} 
            nativeID={`field-${q.key}`}
            style={[styles.formSection, errors[q.key] && { borderColor: '#ef4444', borderWidth: 2 }]}
          >
            <Text style={styles.question}>
              {i + 1}. {q.label}{' '}
              {q.required && <Text style={{ color: '#ef4444' }}>(จำเป็น)</Text>}
            </Text>
            <RadioGroup
              options={q.options.map(o => o.text)}
              value={form[q.key] || ''}
              onChange={(v: string) => updateForm(q.key, v)}
            />
            
            {errors[q.key] && (
              <Text style={{ color: '#ef4444', fontSize: 14, marginTop: 12, fontWeight: 'bold' }}>
                กรุณากรอกข้อมูลในส่วนนี้ให้ครบถ้วน
              </Text>
            )}

            {!q.required && form[q.key] && (
              <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
                <Pressable 
                  onPress={() => updateForm(q.key, '')}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f1f5f9', borderRadius: 6 }}
                >
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>ล้าง</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}

        {ftnd.supplementary.map((field, i) => (
          <View 
            key={field.key} 
            nativeID={`field-${field.key}`}
            style={[styles.formSection, errors[field.key] && { borderColor: '#ef4444', borderWidth: 2 }]}
          >
            <Text style={styles.question}>
              {ftnd.questions.length + i + 1}. {field.label}{' '}
              {field.required && <Text style={{ color: '#ef4444' }}>(จำเป็น)</Text>}
            </Text>
            <RadioGroup
              options={field.options || []}
              value={form[field.key] || ''}
              onChange={(v: string) => updateForm(field.key, v)}
            />

            {errors[field.key] && (
              <Text style={{ color: '#ef4444', fontSize: 14, marginTop: 12, fontWeight: 'bold' }}>
                กรุณากรอกข้อมูลในส่วนนี้ให้ครบถ้วน
              </Text>
            )}

            {!field.required && form[field.key] && (
              <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
                <Pressable 
                  onPress={() => updateForm(field.key, '')}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f1f5f9', borderRadius: 6 }}
                >
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>ล้าง</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderPage3Follower = () => {
    if (!config) return null;
    const fq = config.followerQuestions;
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>{fq.title}</Text>

        {fq.fields.map(field => {
          // Handle conditionals
          if (field.conditional === 'hasSmoker' && form.hasSmoker !== 'มี') return null;

          return (
            <DynamicField
              key={field.key}
              field={field}
              value={form[field.key] || ''}
              onChange={(v: string) => updateForm(field.key, v)}
              otherValue={form[field.key + 'Other'] || ''}
              onOtherChange={(v: string) => updateForm(field.key + 'Other', v)}
              hasError={errors[field.key]}
            />
          );
        })}
      </View>
    );
  };

  const renderPage4Smoker = () => {
    if (!config) return null;
    const mot = config.motivation;
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>{mot.title}</Text>

        {mot.fields.map(field => {
          // Handle conditional show
          if (field.key === 'reasonToQuit') {
            const wantToQuit = form.wantToQuit || '';
            const parentField = mot.fields.find(f => f.conditionalShowKeys?.includes('reasonToQuit'));
            if (parentField && parentField.conditionalShowValues && !parentField.conditionalShowValues.includes(wantToQuit)) {
              return null;
            }
          }

          return (
            <DynamicField
              key={field.key}
              field={field}
              value={form[field.key] || ''}
              onChange={(v: string) => updateForm(field.key, v)}
              hasError={errors[field.key]}
            />
          );
        })}
      </View>
    );
  };

  const renderPage5Smoker = () => {
    if (!config) return null;
    const score = calculateFTND();
    const result = getFTNDLevel(score);
    if (!result) return null;
    const exposure = calculateExposure();

    const diseaseRisks = config.riskAssessment.diseaseRisks || [];
    const recoveryTimeline = config.riskAssessment.recoveryTimeline || [];

    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>ผลการประเมินและวิเคราะห์ความเสี่ยงสุขภาพ</Text>
        <Text style={styles.subtitle}>ประเมินตามเกณฑ์มาตรฐานทางการแพทย์สากล (FTND, WHO, CDC)</Text>

        {/* 1. Nicotine Dependence Assessment */}
        <View style={styles.scoreContainer}>
          <View style={[styles.scoreCircle, { borderColor: result.color }]}>
            <Text style={styles.scoreText}>{score}/10</Text>
          </View>
          <Text style={[styles.levelText, { color: result.color }]}>{result.name}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.detailText}>{result.description}</Text>

          <Text style={styles.tipsTitle}>คำแนะนำเบื้องต้น:</Text>
          {result.tips.map((tip: string, i: number) => (
            <View key={i} style={styles.tipRow}>
              <Feather name="check" size={16} color={result.color} style={{ marginRight: 8 }} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}

          <Text style={styles.refText}>{config.ftndTest.reference}</Text>
        </View>

        {/* 2. Cumulative Exposure & Heavy Smoking Alert */}
        <Text style={styles.sectionHeader}>ปริมาณสารพิษสะสมในร่างกาย</Text>
        <Text style={styles.sectionSubheader}>คำนวณจากความถี่และระยะเวลาการสูบสะสม (Pack-Years)</Text>

        <View style={styles.exposureCard}>
          <View style={styles.exposureGrid}>
            <View style={styles.exposureItem}>
              <Text style={styles.exposureValue}>{exposure.cigLabel}</Text>
              <Text style={styles.exposureLabel}>ปริมาณต่อวัน</Text>
            </View>
            <View style={styles.exposureItem}>
              <Text style={styles.exposureValue}>{exposure.durLabel}</Text>
              <Text style={styles.exposureLabel}>ระยะเวลาที่สูบ</Text>
            </View>
            <View style={styles.exposureItem}>
              <Text style={styles.exposureValue}>{exposure.packYears}</Text>
              <Text style={styles.exposureLabel}>ปี-ซอง (Pack-Years)</Text>
            </View>
          </View>

          {exposure.isHeavyDaily && (
            <View style={styles.heavyAlert}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Feather name="alert-circle" size={16} color="#991b1b" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#991b1b' }}>
                  ข้อสังเกตทางการแพทย์: กลุ่มสูบปริมาณสูง (Heavy Smoker)
                </Text>
              </View>
              <Text style={styles.heavyAlertText}>
                การสูบมากกว่า 20-30 มวนต่อวัน ทำให้ร่างกายได้รับสารพิษและก๊าซคาร์บอนมอนอกไซด์ในปริมาณสูงต่อเนื่อง แม้คะแนนการติดทางกายภาพ (FTND) จะขึ้นอยู่กับปัจจัยอื่น แต่ความเสี่ยงต่อโรคหลอดเลือดและปอดจัดอยู่ในกลุ่มสูงสุด (Highest Exposure Tier)
              </Text>
            </View>
          )}
        </View>

        {/* 3. Disease Risk Stratification (3 Key Diseases) */}
        <Text style={styles.sectionHeader}>การประเมินความเสี่ยงรายโรคสำคัญ</Text>
        <Text style={styles.sectionSubheader}>อ้างอิงข้อมูลสถิติจากองค์การอนามัยโลก (WHO) และ CDC</Text>

        {diseaseRisks.map((d) => (
          <View key={d.id} style={styles.diseaseCard}>
            <View style={styles.diseaseHeader}>
              <View style={[styles.diseaseIconBox, { backgroundColor: `${d.color}15` }]}>
                <Feather name={(d.icon || "activity") as any} size={18} color={d.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.diseaseTitle}>{d.title}</Text>
                <Text style={styles.diseaseSubtitle}>{d.subtitle}</Text>
              </View>
            </View>

            <View style={[styles.riskBadge, { backgroundColor: `${d.color}15` }]}>
              <Text style={[styles.riskBadgeText, { color: d.color }]}>{d.riskFactorText}</Text>
            </View>

            <Text style={styles.diseaseDetails}>{d.details}</Text>
            <Text style={styles.sourceText}>*แหล่งข้อมูล: {d.source}</Text>
          </View>
        ))}

        {/* 4. Evidence-Based Recovery Timeline */}
        <Text style={styles.sectionHeader}>โอกาสฟื้นฟูสุขภาพเมื่อเลิกสูบ (Recovery Timeline)</Text>
        <Text style={styles.sectionSubheader}>การเปลี่ยนแปลงเชิงบวกของร่างกายตามลำดับเวลา (WHO / CDC)</Text>

        <View style={styles.timelineContainer}>
          {recoveryTimeline.map((m, idx) => (
            <View key={idx} style={styles.timelineRow}>
              <View style={styles.timelineBullet} />
              <Text style={styles.timelineTime}>{m.time}</Text>
              <Text style={styles.timelineBenefit}>{m.benefit}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderPage5Follower = () => (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>สรุปข้อมูล</Text>
      <View style={styles.infoCard}>
        <Feather name="heart" size={48} color="#f43f5e" style={{ alignSelf: 'center', marginBottom: 16 }} />
        <Text style={styles.subtitle}>ขอบคุณที่ห่วงใยคนที่คุณรัก</Text>

        <Text style={styles.summaryText}>ความสัมพันธ์: {form.relationship}</Text>
        <Text style={styles.summaryText}>เรื่องที่กังวล: {form.concern === 'อื่นๆ' ? form.concernOther : form.concern}</Text>

        <View style={{ marginTop: 24 }}>
          <Text style={styles.question}>รหัสเชื่อมต่อของผู้สูบ (4 หลัก)</Text>
          <Text style={styles.tipText}>หากยังไม่มีรหัส สามารถกดเริ่มติดตามแล้วกลับมาใส่ภายหลังได้</Text>
          <TextInput
            style={[styles.textInput, { fontSize: 24, textAlign: 'center', letterSpacing: 8, color: '#334155' }]}
            value={form.smokerCode || ''}
            onChangeText={(t: string) => updateForm('smokerCode', t.replace(/[^0-9]/g, ''))}
            placeholder="0000"
            placeholderTextColor="#cbd5e1"
            maxLength={4}
            keyboardType="number-pad"
          />
        </View>
      </View>
    </View>
  );

  // Loading screen while fetching config
  if (configLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerArea}>
          <Text style={styles.headerTitle}>กำลังโหลด...</Text>
        </View>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: '20%' }]} />
        </View>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {/* Skeleton cards */}
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: '60%' }]} />
            <View style={styles.skeletonRadio} />
            <View style={styles.skeletonRadio} />
            <View style={styles.skeletonRadio} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: '45%' }]} />
            <View style={styles.skeletonRadio} />
            <View style={styles.skeletonRadio} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!config) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Feather name="wifi-off" size={48} color="#94a3b8" />
        <Text style={[styles.pageTitle, { textAlign: 'center', marginTop: 16 }]}>ไม่สามารถโหลดแบบฟอร์มได้</Text>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่</Text>
        <Pressable style={[styles.primaryButton, { marginTop: 24 }]} onPress={() => router.replace('/login')}>
          <Text style={styles.primaryButtonText}>กลับหน้าหลัก</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerArea}>
        <Pressable style={styles.backButton} onPress={handleBack} accessibilityLabel="ย้อนกลับ">
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>
          ขั้นตอนที่ {Math.max(1, stepList.indexOf(step) + 1)}/{stepList.length}
        </Text>
      </View>

      {renderProgressBar()}

      <ScrollView 
        ref={scrollViewRef} 
        nativeID="onboarding-scroll-view"
        style={styles.scrollContainer} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View nativeID="onboarding-top-anchor" style={{ height: 1, width: 1, opacity: 0 }} />
        {step === 1 && renderPage1()}
        {step === 2 && renderPage2()}
        {step === 3 && (isSmoker ? renderPage3Smoker() : renderPage3Follower())}
        {step === 4 && (isSmoker ? renderPage4Smoker() : (
          <View style={styles.page}>
            <Text style={styles.pageTitle}>เตรียมพร้อม</Text>
            <Text style={styles.subtitle}>เราพร้อมที่จะช่วยคุณดูแลคนที่คุณรักแล้ว</Text>
          </View>
        ))}
        {step === 5 && (isSmoker ? renderPage5Smoker() : renderPage5Follower())}
      </ScrollView>

      {/* Sticky Bottom Action Bar with Box Shadow */}
      <View style={styles.stickyFooter}>
        <View style={styles.stickyFooterInner}>
          {step < 5 ? (
            <View style={{ width: '100%', gap: 6 }}>
              <Pressable style={styles.primaryButton} onPress={handleNext}>
                <Text style={styles.primaryButtonText}>ถัดไป</Text>
              </Pressable>
              <Pressable style={styles.skipButton} onPress={skipRest} disabled={loading}>
                <Text style={styles.skipButtonText}>
                  {intent || form.isSmokerStr ? 'ข้ามคำถามที่เหลือ แล้วเริ่มใช้เลย' : 'ข้ามทั้งหมด ขอลองใช้งานก่อน'}
                </Text>
              </Pressable>
            </View>
          ) : isSmoker ? (
            <View style={{ width: '100%', gap: 8 }}>
              <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>เริ่มต้นเส้นทางเลิกบุหรี่</Text>}
              </Pressable>

              {calculateFTND() >= config.riskAssessment.hotlineThreshold && (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => Linking.openURL(`tel:${config.riskAssessment.hotlineNumber}`)}
                >
                  <Feather name="phone-call" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={[styles.secondaryButtonText, { color: '#ef4444' }]}>
                    โทรสายด่วนเลิกบุหรี่ {config.riskAssessment.hotlineNumber} (โทรฟรี 24 ชม.)
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{form.smokerCode && form.smokerCode.length > 0 ? 'เริ่มติดตาม' : 'ข้าม'}</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdfa' },
  headerArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  backButton: { position: 'absolute', left: 20, top: Platform.OS === 'ios' ? 60 : 40, zIndex: 10 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 'bold', color: '#64748b' },
  progressContainer: { height: 4, backgroundColor: '#e2e8f0', width: '100%' },
  progressBar: { height: '100%', backgroundColor: '#38bdf8' },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60, maxWidth: 600, alignSelf: 'center', width: '100%' },
  page: { flex: 1 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  formSection: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  question: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  radioGroup: { flexDirection: 'column', gap: 12 },
  radioItem: { flexDirection: 'row', alignItems: 'center' },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 12 },
  radioCircleSelected: { borderColor: '#38bdf8', borderWidth: 6 },
  checkboxSquare: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 12 },
  checkboxSquareSelected: { borderColor: '#38bdf8', backgroundColor: '#38bdf8' },
  radioText: { fontSize: 16, color: '#334155' },
  otherContainer: { flexDirection: 'column', marginTop: 4 },
  textInput: { borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingVertical: 8, fontSize: 16, color: '#334155', marginTop: 8 },
  nextButton: { backgroundColor: '#38bdf8', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  primaryButton: { 
    backgroundColor: '#38bdf8', 
    paddingVertical: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    width: '100%',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  skipButton: { paddingVertical: 10, alignItems: 'center' },
  skipButtonText: { color: '#0369a1', fontSize: 14, fontWeight: '600' },
  privacyCard: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(15,118,110,0.08)', borderRadius: 12, padding: 14, marginBottom: 16 },
  privacyCardText: { flex: 1, color: '#115e59', fontSize: 13, lineHeight: 20 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryButton: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    backgroundColor: '#fff', 
    paddingVertical: 14, 
    borderRadius: 14, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#fca5a5',
    width: '100%',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: 'bold' },
  stickyFooter: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
    width: '100%',
    zIndex: 50,
  },
  stickyFooterInner: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  scoreContainer: { alignItems: 'center', marginVertical: 24 },
  scoreCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  scoreText: { fontSize: 32, fontWeight: 'bold', color: '#0f172a' },
  levelText: { fontSize: 20, fontWeight: 'bold' },
  infoCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  detailText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  tipsTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginTop: 16, marginBottom: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  tipText: { fontSize: 14, color: '#475569', flex: 1 },
  refText: { fontSize: 12, color: '#94a3b8', marginTop: 16, fontStyle: 'italic' },
  summaryText: { fontSize: 16, color: '#334155', marginBottom: 8, fontWeight: '500' },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 24, marginBottom: 4 },
  sectionSubheader: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  exposureCard: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 16 },
  exposureGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  exposureItem: { flex: 1, alignItems: 'center' },
  exposureValue: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  exposureLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  heavyAlert: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', marginTop: 12 },
  heavyAlertText: { fontSize: 12, color: '#991b1b', lineHeight: 18, fontWeight: '500' },
  diseaseCard: { backgroundColor: '#fff', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14, shadowColor: 'rgba(0,0,0,0.03)', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 },
  diseaseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  diseaseIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  diseaseTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  diseaseSubtitle: { fontSize: 12, color: '#64748b' },
  riskBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
  riskBadgeText: { fontSize: 12, fontWeight: '700' },
  diseaseDetails: { fontSize: 13, color: '#475569', lineHeight: 20 },
  sourceText: { fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' },
  timelineContainer: { backgroundColor: '#fff', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  timelineRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  timelineBullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#38bdf8', marginTop: 6, marginRight: 12 },
  timelineTime: { fontSize: 14, fontWeight: '700', color: '#0284c7', width: 95 },
  timelineBenefit: { fontSize: 13, color: '#334155', flex: 1, lineHeight: 19 },
  skeletonTitle: { width: '50%', height: 24, borderRadius: 8, backgroundColor: '#e2e8f0', marginBottom: 16 },
  skeletonCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  skeletonLine: { width: '80%', height: 14, borderRadius: 6, backgroundColor: '#e2e8f0', marginBottom: 12 },
  skeletonRadio: { width: '70%', height: 22, borderRadius: 11, backgroundColor: '#f1f5f9', marginBottom: 10, marginLeft: 34 },
});
