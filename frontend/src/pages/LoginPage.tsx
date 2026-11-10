import { Card } from '@/components/ui/card';
import Logo from '@/assets/logo.png';
import LoginForm from '@/features/auth/components/LoginForm';

const LoginPage = () => {
    return (
        <>
            <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-10">
                <div className="flex flex-row items-center justify-center gap-2">
                    <img
                        src={Logo}
                        alt="Logo"
                    />
                    <p className="font-bold text-2xl text-indigo-900">Aaron</p>
                </div>
                <Card className="w-full max-w-sm rounded-2xl p-6!">
                    <LoginForm />
                </Card>
            </div>
        </>
    );
};

export default LoginPage;
