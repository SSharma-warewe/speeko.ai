import { useParams, useSearchParams } from 'react-router-dom';
import TaskStudio from '../components/TaskStudio';
export default function VoiceTasksPage({
  admin = false,
  whatsapp = false,
}: {
  admin?: boolean;
  whatsapp?: boolean;
}) {
  const [params] = useSearchParams();
  const { taskId, orgId } = useParams();
  const channel =
    whatsapp || (!taskId && params.get('channel') === 'whatsapp')
      ? 'whatsapp'
      : 'voice';
  return (
    <TaskStudio
      key={channel + ':' + (orgId ?? '')}
      channel={channel}
      admin={admin}
    />
  );
}
