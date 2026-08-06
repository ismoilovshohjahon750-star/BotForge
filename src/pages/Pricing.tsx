import React from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Check } from 'lucide-react';

export const Pricing: React.FC = () => {
  const plans = [
    {
      name: "Bepul",
      price: "$0",
      desc: "Yangi boshlovchilar uchun",
      features: ["2 tagacha bot", "Botly AI limiti: 45 tokin/kuniga", "Uptime: 24/7", "Standart qo'llab-quvvatlash"],
      button: "Hozir boshlang",
      popular: false
    },
    {
      name: "Pro",
      price: "$19",
      desc: "Kichik biznes va loyihalar uchun",
      features: ["10 tagacha bot", "Botly AI limiti: 145 tokin/kuniga", "Uptime: 24/7", "Batafsil terminal loglari", "Prioritet qo'llab-quvvatlash", "Maxsus webhooklar va ZIP yuklash"],
      button: "Obuna bo'lish",
      popular: true
    },
    {
      name: "VIP",
      price: "$49",
      desc: "Professional va yirik loyihalar uchun",
      features: ["30 tagacha bot", "Botly AI limiti: 500 tokin/kuniga", "Uptime: 24/7 (Maksimal tezlik)", "Cheksiz terminal loglari", "24/7 Prioritet yordam", "Yuqori server resurslari"],
      button: "Obuna bo'lish",
      popular: false
    }
  ];

  return (
    <div className="container mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Sizga mos tarifni tanlang</h1>

      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan, i) => (
          <Card key={i} className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-2xl shadow-primary/20 scale-105 z-10' : ''}`}>
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full">
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
                    <Check className="w-4 h-4 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full h-12 rounded-xl" variant={plan.popular ? 'default' : 'outline'}>
                {plan.button}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};
