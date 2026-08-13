import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Check, MessageSquare, Send, X, Sparkles, ShieldCheck, PhoneCall, User, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface Plan {
  name: string;
  price: string;
  desc: string;
  features: string[];
  button: string;
  popular?: boolean;
}

export const Pricing: React.FC = () => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const plans: Plan[] = [
    {
      name: "Bepul",
      price: "$0",
      desc: "Yangi boshlovchilar uchun",
      features: ["2 tagacha bot", "Botlar 2 oy ishlab beradi", "Botly AI limiti: 45 tokin/kuniga", "Uptime: 24/7", "Standart qo'llab-quvvatlash"],
      button: "Hozir boshlang",
      popular: false
    },
    {
      name: "Pro",
      price: "$19",
      desc: "Kichik biznes va loyihalar uchun",
      features: ["10 tagacha bot", "Botlar 10 oy davomida kafolatli ishlaydi", "Botly AI limiti: 145 tokin/kuniga", "Uptime: 24/7", "Batafsil terminal loglari", "Prioritet qo'llab-quvvatlash", "Maxsus webhooklar va ZIP yuklash"],
      button: "Obuna bo'lish",
      popular: true
    },
    {
      name: "VIP",
      price: "$49",
      desc: "Professional va yirik loyihalar uchun",
      features: ["30 tagacha bot", "Botlar cheksiz ravishda ishlab beradi", "Botly AI limiti: 500 tokin/kuniga", "Uptime: 24/7 (Maksimal tezlik)", "Cheksiz terminal loglari", "24/7 Prioritet yordam", "Yuqori server resurslari"],
      button: "Obuna bo'lish",
      popular: false
    }
  ];

  // Prefill user information when modal opens or user logs in
  useEffect(() => {
    if (user) {
      if (user.displayName && !name) setName(user.displayName);
    }
  }, [user]);

  const handleOpenModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
    // Set a clean default template message based on chosen plan
    setMessage(`Assalomu alaykum! Men ${plan.name} (${plan.price}/oy) tarifiga obuna bo'lmoqchiman. Iltimos to'lov rekvizitlari va faollashtirish shartlarini yuborsangiz.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Telefon raqamingizni kiritishingiz shart!");
      return;
    }
    if (!message.trim()) {
      toast.error("Iltimos, xabar matnini kiriting!");
      return;
    }

    setSending(true);
    try {
      const planName = selectedPlan?.name || "Noma'lum";
      const planPrice = selectedPlan?.price || "";
      const senderName = name.trim() || user?.displayName || "Foydalanuvchi";
      const senderPhone = phone.trim();
      const userEmail = user?.email || "Noma'lum email";

      const formattedMessage = `[TARIF SO'ROVI: ${planName} (${planPrice}/oy)]\n\n📞 Telefon raqami: ${senderPhone}\n✉️ Account Email: ${userEmail}\n\n💬 Xabar:\n${message.trim()}`;

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: senderName,
          email: `${senderPhone} (${userEmail})`,
          message: formattedMessage
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Xabaringiz muvaffaqiyatli yuborildi! Administrator ${senderPhone} raqamiga javob beradi.`);
        setIsModalOpen(false);
      } else {
        toast.error(data.error || "Xabarni yuborishda xatolik yuz berdi");
      }
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Tarmoq xatosi. Xabar yuborilmadi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-20 relative">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Sizga mos tarifni tanlang</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Istalgan tarif ustiga bosing va administrator bilan to'g'ridan-to'g'ri xabarlashib obunani rasmiylashtiring.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan, i) => (
          <Card key={i} className={`relative flex flex-col transition-all hover:border-primary/50 ${plan.popular ? 'border-primary shadow-2xl shadow-primary/20 scale-105 z-10' : ''}`}>
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-lg">
                ENG OMMABOP
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">/oyiga</span>
              </div>
              <ul className="space-y-3">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-medium" 
                variant={plan.popular ? 'default' : 'outline'}
                onClick={() => handleOpenModal(plan)}
              >
                <MessageSquare className="w-4 h-4" />
                <span>{plan.button}</span>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Subscription Request & Direct Message Modal */}
      <AnimatePresence>
        {isModalOpen && selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Obuna va Xabar Yuborish</h2>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">{selectedPlan.name}</span> ({selectedPlan.price}/oy) tarifi bo'yicha administratorga murojaat
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-muted"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Plan Badge Preview */}
              <div className="px-6 py-3 bg-primary/5 border-b border-border flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="w-4 h-4" />
                  Murojaatingiz bevosita administratsiyaga yetkaziladi
                </span>
                <span className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                  {selectedPlan.name} - {selectedPlan.price}
                </span>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Name field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Ismingiz
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ismingizni kiriting"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>

                {/* Mandatory Phone field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                    <span>Telefon raqamingiz</span>
                    <span className="text-destructive font-bold">* Majburiy</span>
                  </label>
                  <div className="relative">
                    <PhoneCall className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>

                {/* Message Textarea */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Xabaringiz
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Xabaringiz va obuna bo'yicha istaklaringizni shu yerga yozing..."
                    className="w-full p-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    required
                  />
                </div>

                {/* Modal Actions */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl"
                  >
                    Bekor qilish
                  </Button>
                  <Button
                    type="submit"
                    disabled={sending}
                    className="rounded-xl px-6 flex items-center gap-2 font-semibold shadow-lg shadow-primary/20"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Yuborilmoqda...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Xabarni Yuborish</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

