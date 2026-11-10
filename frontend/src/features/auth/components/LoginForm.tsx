import { useForm } from "@tanstack/react-form";
import useLogin from "../hooks/useLogin";
import { loginSchema } from "../schemas/login.schema";
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { EyeOffIcon, EyeIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "react-router-dom";

const LoginForm = () => {
    const [eyeOff, setEyeOff] = useState(true);
    const { login, isPending } = useLogin();

    const form = useForm({
        defaultValues: {
            email: '',
            password: '',
        },
        validators: {
            onSubmit: loginSchema,
        },
        onSubmit: async ({ value }) => {
            login(loginSchema.parse(value));
        }
    });

    return (
        <>
            <form
                onSubmit={e => {
                    e.preventDefault();
                    form.handleSubmit();
                }}
                className="flex flex-col gap-4">
                <FieldGroup>
                    <form.Field
                        name="email"
                        children={field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Email Address</FieldLabel>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={e => field.handleChange(e.target.value)}
                                        aria-invalid={isInvalid}
                                        placeholder="Enter email address"
                                        autoComplete="on"
                                    />
                                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    />
                    <form.Field
                        name="password"
                        children={field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            type={eyeOff ? "password" : "te"}
                                            id={field.name}
                                            name={field.name}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={e => field.handleChange(e.target.value)}
                                            aria-invalid={isInvalid}
                                            placeholder="Enter password"
                                            autoComplete="off"
                                        />
                                        <InputGroupAddon align="inline-end" className="cursor-pointer" onClick={() => setEyeOff(!eyeOff)}>
                                            {eyeOff ? <EyeOffIcon /> : <EyeIcon />}
                                        </InputGroupAddon>
                                    </InputGroup>
                                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    />
                </FieldGroup>
                <div className="flex flex-col gap-4 items-center justify-center">
                    <Button
                        type="submit"
                        className="w-fit"
                        variant="indigo"
                        size="lg"
                        isLoading={isPending}
                    >
                        Log In
                    </Button>
                    <p className="text-sm text-slate-600">
                        Not an existing user? Sign up{" "}
                        <Link to="/register" className="hover:text-indigo-500 underline">
                            here!
                        </Link>
                    </p>
                </div>
            </form>
        </>
    );
};

export default LoginForm;
