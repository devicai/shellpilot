import { Avatar, Card, Popover, Menu } from 'antd';
import Meta from 'antd/es/card/Meta';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAngleDown,
  faAngleUp,
  faArrowRightFromBracket,
  faGear,
  faBook,
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

function FooterPopoverContent() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <Menu
      style={{ width: 200, border: 'none', padding: 0, backgroundColor: 'transparent' }}
      selectedKeys={[]}
      items={[
        {
          key: 'settings',
          icon: <FontAwesomeIcon icon={faGear} />,
          label: 'Settings',
          onClick: () => navigate('/settings'),
        },
        {
          key: 'documentation',
          icon: <FontAwesomeIcon icon={faBook} />,
          label: 'Documentation',
          onClick: () => window.open('https://docs.devic.ai', '_blank'),
        },
        {
          key: 'logout',
          icon: <FontAwesomeIcon icon={faArrowRightFromBracket} />,
          label: 'Log Out',
          onClick: async () => {
            await logout();
            navigate('/login');
          },
        },
      ]}
    />
  );
}

export function SidebarFooter() {
  const { user } = useAuth();
  const displayName = user?.name || user?.email || 'ShellPilot User';
  const displayEmail = user?.email || '';
  const initials =
    displayName
      ?.split(' ')
      ?.map((w) => w[0]?.toUpperCase())
      ?.slice(0, 2)
      ?.join('') || '';

  return (
    <div style={{ width: '100%', cursor: 'pointer' }}>
      <Popover placement="right" arrow={false} content={<FooterPopoverContent />}>
        <Card
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            padding: 0,
            borderRadius: 8,
          }}
          styles={{ body: { padding: 10 } }}
        >
          <Meta
            avatar={<Avatar>{initials}</Avatar>}
            style={{ fontSize: 12 }}
            description={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <div style={{ flex: 1, marginRight: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      color: '#d9d9d9',
                    }}
                  >
                    {displayName}
                  </div>
                  <div
                    style={{
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      opacity: 0.65,
                    }}
                  >
                    {displayEmail}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <FontAwesomeIcon icon={faAngleUp} style={{ fontSize: 10 }} />
                  <FontAwesomeIcon icon={faAngleDown} style={{ fontSize: 10 }} />
                </div>
              </div>
            }
          />
        </Card>
      </Popover>
    </div>
  );
}
