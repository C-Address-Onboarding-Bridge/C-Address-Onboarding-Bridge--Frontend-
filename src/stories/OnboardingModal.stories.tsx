import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { OnboardingModal, OnboardingStep } from '../components/OnboardingModal';

const sampleSteps: OnboardingStep[] = [
  {
    title: 'Welcome to C-Address',
    description: 'C-Address Onboarding Bridge helps you seamlessly connect your identity across chains.',
  },
  {
    title: 'Connect Your Wallet',
    description: 'Link your preferred wallet to begin the onboarding process. We support MetaMask, WalletConnect, and more.',
  },
  {
    title: 'Verify Your Identity',
    description: 'Complete a quick KYC verification to unlock full platform features and cross-chain transfers.',
  },
  {
    title: 'Ready to Go!',
    description: 'Your onboarding is complete. Start bridging assets and managing your cross-chain identity.',
  },
];

const meta: Meta<typeof OnboardingModal> = {
  title: 'Components/OnboardingModal',
  component: OnboardingModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OnboardingModal>;

function OnboardingDemo(props: Partial<React.ComponentProps<typeof OnboardingModal>>) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div style={{ padding: '20px' }}>
      <button onClick={() => setIsOpen(true)}>Open Onboarding</button>
      <OnboardingModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onComplete={() => {
          setIsOpen(false);
          alert('Onboarding complete!');
        }}
        steps={sampleSteps}
        {...props}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <OnboardingDemo />,
};

export const SecondStep: Story = {
  render: () => <OnboardingDemo initialStep={1} />,
};

export const LastStep: Story = {
  render: () => <OnboardingDemo initialStep={3} />,
};

export const SingleStep: Story = {
  render: () => (
    <OnboardingDemo
      steps={[{ title: 'Quick Setup', description: 'One-step onboarding for returning users.' }]}
    />
  ),
};
